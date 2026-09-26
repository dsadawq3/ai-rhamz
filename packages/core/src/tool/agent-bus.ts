export * as AgentBus from "./agent-bus.js"

import path from "path"

export function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").toLowerCase()
}

/**
 * Fast deterministic 8-hex-character content hash (dual 32-bit FNV-1a).
 */
export function hashContent(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= c ^ (i & 0xff)
    h2 = Math.imul(h2, 0x811c9dc5)
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0").slice(0, 4)
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0").slice(0, 4)
  return `${hex1}${hex2}`
}

interface SessionReadRecord {
  readonly normalizedPath: string
  readonly hash: string
  readonly lineCount: number
  readonly timestamp: number
  count: number
}

interface LastModifier {
  readonly sessionID: string
  readonly agent: string
  readonly timestamp: number
}

interface CachedToolEntry<T> {
  readonly value: T
  readonly timestamp: number
  readonly mutationEpoch: number
}

const TOOL_CACHE_TTL_MS = 45_000
const CONTENTION_WINDOW_MS = 5 * 60 * 1_000

// Per-session read ledger: sessionID -> Map<rangeKey, SessionReadRecord>
const sessionReads = new Map<string, Map<string, SessionReadRecord>>()

// Cross-agent file mutation tracker: normalizedPath -> LastModifier
const lastModifierByPath = new Map<string, LastModifier>()

// Global mutation epoch incremented whenever any file is edited/written/patched
let globalMutationEpoch = 1

// Shared read-only tool result cache (grep / glob across parallel subagents)
const toolResultCache = new Map<string, CachedToolEntry<unknown>>()
const inFlightToolCalls = new Map<string, Promise<unknown>>()

function makeRangeKey(normalizedPath: string, offset: number | undefined, limit: number | undefined): string {
  return `${normalizedPath}::${offset ?? 1}::${limit ?? 0}`
}

/**
 * Checks if this session has already read the exact same file slice with the exact same content hash.
 * If so, returns the existing record so the caller can short-circuit and save context tokens.
 */
export function checkAndRecordSessionRead(input: {
  sessionID: string
  absolutePath: string
  offset?: number
  limit?: number
  content: string
  lineCount: number
}): { deduplicated: boolean; hash: string; previousReads: number } {
  const norm = normalizePath(input.absolutePath)
  const hash = hashContent(input.content)
  if (!input.sessionID) {
    return { deduplicated: false, hash, previousReads: 0 }
  }

  let map = sessionReads.get(input.sessionID)
  if (!map) {
    map = new Map()
    sessionReads.set(input.sessionID, map)
  }

  const key = makeRangeKey(norm, input.offset, input.limit)
  const existing = map.get(key)
  if (existing && existing.hash === hash) {
    existing.count++
    return { deduplicated: true, hash, previousReads: existing.count - 1 }
  }

  map.set(key, {
    normalizedPath: norm,
    hash,
    lineCount: input.lineCount,
    timestamp: Date.now(),
    count: 1,
  })
  return { deduplicated: false, hash, previousReads: 0 }
}

/**
 * Clears cached read hashes for a session (called automatically upon session compaction
 * so the model can re-read files fresh after older history is compacted).
 */
export function clearSessionReads(sessionID: string) {
  sessionReads.delete(sessionID)
}

/**
 * Invalidates all cached reads for a specific file across all sessions and bumps
 * the workspace mutation epoch when a file is modified or deleted.
 */
export function invalidateFile(
  absolutePath: string,
  modifier?: { sessionID: string; agent: string },
): LastModifier | undefined {
  const norm = normalizePath(absolutePath)
  globalMutationEpoch++
  toolResultCache.clear()

  for (const map of sessionReads.values()) {
    for (const [key, rec] of map.entries()) {
      if (rec.normalizedPath === norm) {
        map.delete(key)
      }
    }
  }

  const previous = lastModifierByPath.get(norm)
  if (modifier?.sessionID) {
    lastModifierByPath.set(norm, {
      sessionID: modifier.sessionID,
      agent: modifier.agent,
      timestamp: Date.now(),
    })
  }
  return previous
}

/**
 * Checks whether another parallel session/subagent recently modified the same file.
 */
export function getRecentOtherModifier(
  absolutePath: string,
  currentSessionID: string,
): LastModifier | undefined {
  if (!currentSessionID) return undefined
  const norm = normalizePath(absolutePath)
  const prev = lastModifierByPath.get(norm)
  if (!prev) return undefined
  if (prev.sessionID === currentSessionID) return undefined
  if (Date.now() - prev.timestamp > CONTENTION_WINDOW_MS) return undefined
  return prev
}

/**
 * Deduplicates and caches read-only tool queries (such as parallel subagent grep/glob calls)
 * as long as no file mutations have occurred.
 */
export function getCachedToolResult<T>(cacheKey: string): T | undefined {
  const entry = toolResultCache.get(cacheKey)
  if (!entry) return undefined
  if (entry.mutationEpoch !== globalMutationEpoch || Date.now() - entry.timestamp > TOOL_CACHE_TTL_MS) {
    toolResultCache.delete(cacheKey)
    return undefined
  }
  return entry.value as T
}

export function setCachedToolResult<T>(cacheKey: string, value: T): void {
  if (toolResultCache.size > 250) {
    const oldest = toolResultCache.keys().next().value
    if (oldest) toolResultCache.delete(oldest)
  }
  toolResultCache.set(cacheKey, {
    value,
    timestamp: Date.now(),
    mutationEpoch: globalMutationEpoch,
  })
}

export function getInFlightTool<T>(cacheKey: string): Promise<T> | undefined {
  return inFlightToolCalls.get(cacheKey) as Promise<T> | undefined
}

export function setInFlightTool<T>(cacheKey: string, promise: Promise<T>): void {
  inFlightToolCalls.set(cacheKey, promise)
  promise.finally(() => {
    if (inFlightToolCalls.get(cacheKey) === promise) {
      inFlightToolCalls.delete(cacheKey)
    }
  })
}
