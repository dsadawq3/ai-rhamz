export * as WorkingState from "./working-state.js"

import fs from "fs"
import path from "path"

export interface TrackedFile {
  readonly path: string
  reads: number
  lastHash?: string
  lastReadRange?: string
  edits: number
  created: boolean
  deleted: boolean
  lastActionAt: number
  lastEditorSession?: string
}

export interface TrackedSubagent {
  readonly sessionID: string
  readonly agent: string
  readonly description: string
  status: "running" | "completed" | "cancelled"
  findingsPreview?: string
  updatedAt: number
}

export interface TrackedCommand {
  readonly command: string
  readonly exit?: number
  readonly failed: boolean
  readonly errorPreview?: string
  readonly timestamp: number
}

export interface SessionWorkingState {
  readonly sessionID: string
  parentSessionID?: string
  workspaceDir?: string
  readonly files: Map<string, TrackedFile>
  readonly subagents: Map<string, TrackedSubagent>
  readonly commands: TrackedCommand[]
  compactionCount: number
  lastCompactionFile?: string
}

const MAX_COMMANDS = 30
const MAX_FILES = 80
const states = new Map<string, SessionWorkingState>()

function getOrCreate(sessionID: string): SessionWorkingState {
  let state = states.get(sessionID)
  if (!state) {
    state = {
      sessionID,
      files: new Map(),
      subagents: new Map(),
      commands: [],
      compactionCount: 0,
    }
    states.set(sessionID, state)
  }
  return state
}

function rootState(sessionID: string): SessionWorkingState | undefined {
  let current = states.get(sessionID)
  let guard = 0
  while (current?.parentSessionID && guard < 10) {
    guard++
    const parent = states.get(current.parentSessionID)
    if (!parent) break
    current = parent
  }
  return current && current.sessionID !== sessionID ? current : undefined
}

export function setWorkspace(sessionID: string, workspaceDir: string) {
  if (!sessionID || !workspaceDir) return
  const state = getOrCreate(sessionID)
  state.workspaceDir = workspaceDir
  const root = rootState(sessionID)
  if (root && !root.workspaceDir) root.workspaceDir = workspaceDir
}

export function getWorkspace(sessionID: string): string | undefined {
  return states.get(sessionID)?.workspaceDir ?? rootState(sessionID)?.workspaceDir
}

export function linkChildSession(parentSessionID: string, childSessionID: string, agent: string, description: string) {
  const child = getOrCreate(childSessionID)
  child.parentSessionID = parentSessionID
  const parent = getOrCreate(parentSessionID)
  if (parent.workspaceDir && !child.workspaceDir) {
    child.workspaceDir = parent.workspaceDir
  }
  parent.subagents.set(childSessionID, {
    sessionID: childSessionID,
    agent,
    description,
    status: "running",
    updatedAt: Date.now(),
  })
}

export function updateSubagentStatus(
  parentSessionID: string,
  childSessionID: string,
  status: "running" | "completed" | "cancelled",
  findingsPreview?: string,
) {
  const parent = getOrCreate(parentSessionID)
  const existing = parent.subagents.get(childSessionID)
  if (existing) {
    existing.status = status
    existing.updatedAt = Date.now()
    if (findingsPreview) {
      existing.findingsPreview = findingsPreview.replace(/\s+/g, " ").trim().slice(0, 240)
    }
  }
}

function applyFileTouch(
  state: SessionWorkingState,
  relPath: string,
  action: {
    type: "read" | "edit" | "write" | "delete"
    hash?: string
    range?: string
    editorSession?: string
  },
) {
  let entry = state.files.get(relPath)
  if (!entry) {
    if (state.files.size >= MAX_FILES) {
      const oldestKey = state.files.keys().next().value
      if (oldestKey) state.files.delete(oldestKey)
    }
    entry = {
      path: relPath,
      reads: 0,
      edits: 0,
      created: false,
      deleted: false,
      lastActionAt: Date.now(),
    }
    state.files.set(relPath, entry)
  }
  entry.lastActionAt = Date.now()
  if (action.type === "read") {
    entry.reads++
    if (action.hash) entry.lastHash = action.hash
    if (action.range) entry.lastReadRange = action.range
  } else if (action.type === "edit") {
    entry.edits++
    entry.deleted = false
    if (action.hash) entry.lastHash = action.hash
    if (action.editorSession) entry.lastEditorSession = action.editorSession
  } else if (action.type === "write") {
    if (entry.reads === 0 && entry.edits === 0) entry.created = true
    entry.edits++
    entry.deleted = false
    if (action.hash) entry.lastHash = action.hash
    if (action.editorSession) entry.lastEditorSession = action.editorSession
  } else if (action.type === "delete") {
    entry.deleted = true
    if (action.editorSession) entry.lastEditorSession = action.editorSession
  }
}

export function recordFileRead(
  sessionID: string,
  filePath: string,
  opts?: { hash?: string; range?: string; workspaceDir?: string },
) {
  if (!sessionID || !filePath) return
  if (opts?.workspaceDir) setWorkspace(sessionID, opts.workspaceDir)
  const state = getOrCreate(sessionID)
  const rel = state.workspaceDir ? path.relative(state.workspaceDir, filePath) || filePath : filePath
  applyFileTouch(state, rel, { type: "read", hash: opts?.hash, range: opts?.range })
  const root = rootState(sessionID)
  if (root) applyFileTouch(root, rel, { type: "read", hash: opts?.hash, range: opts?.range })
}

export function recordFileMutation(
  sessionID: string,
  filePath: string,
  kind: "edit" | "write" | "delete",
  opts?: { hash?: string; workspaceDir?: string },
) {
  if (!sessionID || !filePath) return
  if (opts?.workspaceDir) setWorkspace(sessionID, opts.workspaceDir)
  const state = getOrCreate(sessionID)
  const rel = state.workspaceDir ? path.relative(state.workspaceDir, filePath) || filePath : filePath
  applyFileTouch(state, rel, { type: kind, hash: opts?.hash, editorSession: sessionID })
  const root = rootState(sessionID)
  if (root) applyFileTouch(root, rel, { type: kind, hash: opts?.hash, editorSession: sessionID })
}

export function recordCommand(
  sessionID: string,
  command: string,
  exit: number | undefined,
  outputText?: string,
) {
  if (!sessionID || !command) return
  const state = getOrCreate(sessionID)
  const failed = exit !== undefined && exit !== 0
  const errorPreview =
    failed && outputText
      ? outputText
          .split("\n")
          .filter((l) => l.trim().length > 0 && !l.startsWith("[ShellCompress:"))
          .slice(-4)
          .join(" | ")
          .slice(0, 240)
      : undefined
  const item: TrackedCommand = {
    command: command.replace(/\s+/g, " ").trim().slice(0, 180),
    exit,
    failed,
    errorPreview,
    timestamp: Date.now(),
  }
  state.commands.push(item)
  if (state.commands.length > MAX_COMMANDS) state.commands.shift()
  const root = rootState(sessionID)
  if (root) {
    root.commands.push(item)
    if (root.commands.length > MAX_COMMANDS) root.commands.shift()
  }
}

export function contextDir(workspaceDir: string): string {
  return path.join(workspaceDir, ".opencode", "context")
}

export function compactionFilePath(workspaceDir: string, sessionID: string): string {
  const safeId = sessionID.replace(/[^a-zA-Z0-9_-]/g, "_")
  return path.join(contextDir(workspaceDir), `compaction-${safeId}.md`)
}

export function latestCompactionFilePath(workspaceDir: string): string {
  return path.join(contextDir(workspaceDir), "latest-compaction.md")
}

export function customContextFilePath(workspaceDir: string): string {
  return path.join(contextDir(workspaceDir), "context.md")
}

/**
 * Formats the non-intrusive automatic WorkingState digest (V2 instant tracking)
 * to assist post-compaction memory without overriding the LLM's custom summary.
 */
export function formatAutoSummary(sessionID: string, workspaceDir?: string): string {
  const state = states.get(sessionID)
  const dir = workspaceDir ?? state?.workspaceDir
  const sections: string[] = []

  if (state) {
    const modifiedFiles: string[] = []
    const readOnlyFiles: string[] = []
    for (const f of state.files.values()) {
      const hashTag = f.lastHash ? ` [hash:${f.lastHash}]` : ""
      if (f.deleted) {
        modifiedFiles.push(`- \`${f.path}\` (DELETED)`)
      } else if (f.created) {
        modifiedFiles.push(`- \`${f.path}\` (CREATED, ${f.edits} write(s))${hashTag}`)
      } else if (f.edits > 0) {
        modifiedFiles.push(`- \`${f.path}\` (EDITED ${f.edits}x, read ${f.reads}x)${hashTag}`)
      } else if (f.reads > 0) {
        const rangeTag = f.lastReadRange ? ` (${f.lastReadRange})` : ""
        readOnlyFiles.push(`- \`${f.path}\`${rangeTag}${hashTag}`)
      }
    }

    if (modifiedFiles.length > 0) {
      sections.push(`### Modified / Created Files (Auto-Tracked)\n${modifiedFiles.slice(-25).join("\n")}`)
    }
    if (readOnlyFiles.length > 0) {
      sections.push(`### Key Inspected Files (Auto-Tracked)\n${readOnlyFiles.slice(-20).join("\n")}`)
    }

    if (state.subagents.size > 0) {
      const subLines: string[] = []
      for (const sub of state.subagents.values()) {
        const preview = sub.findingsPreview ? ` — ${sub.findingsPreview}` : ""
        subLines.push(`- \`${sub.sessionID}\` [${sub.agent}] (${sub.status}): "${sub.description}"${preview}`)
      }
      sections.push(`### Subagent Swarm Ledger (Auto-Tracked)\n${subLines.join("\n")}`)
    }

    const failedCmds = state.commands.filter((c) => c.failed).slice(-8)
    const recentCmds = state.commands.slice(-8)
    if (failedCmds.length > 0) {
      sections.push(
        `### Recent Command Failures (Auto-Tracked)\n${failedCmds
          .map((c) => `- \`${c.command}\` (exit ${c.exit ?? "?"})${c.errorPreview ? `: ${c.errorPreview}` : ""}`)
          .join("\n")}`,
      )
    } else if (recentCmds.length > 0) {
      sections.push(
        `### Recent Shell Commands (Auto-Tracked)\n${recentCmds
          .map((c) => `- \`${c.command}\` (exit ${c.exit ?? 0})`)
          .join("\n")}`,
      )
    }
  }

  if (dir) {
    const compFile = path.relative(dir, compactionFilePath(dir, sessionID)).replace(/\\/g, "/")
    const ctxFile = path.relative(dir, customContextFilePath(dir)).replace(/\\/g, "/")
    sections.push(
      `### Editable Compaction & Context Files\n- Session Checkpoint: \`${compFile}\`\n- Persistent Operator Context: \`${ctxFile}\`\n*(You or the operator can read/edit these files or use the TUI **Context** tab to pin critical targets, payloads, offsets, subagent chains, or custom instructions across compactions.)*`,
    )
  }

  if (sections.length === 0) return ""
  return `## Auto-Tracked Working State (V2 Digest)\n${sections.join("\n\n")}`
}

export function hasActivity(sessionID: string): boolean {
  const state = states.get(sessionID)
  if (state) {
    if (
      state.workspaceDir ||
      state.files.size > 0 ||
      state.subagents.size > 0 ||
      state.commands.length > 0
    ) {
      return true
    }
  }
  const root = rootState(sessionID)
  if (root?.workspaceDir) return true
  try {
    if (fs.existsSync(customContextFilePath(process.cwd()))) return true
  } catch {
    // ignore
  }
  return false
}

/**
 * Saves the completed compaction summary + WorkingState digest to disk so the
 * user or agent can inspect and edit it directly.
 */
export function persistCompactionFile(
  sessionID: string,
  llmSummary: string,
  workspaceDir?: string,
): { fullSummary: string; filePath?: string; customContext?: string } {
  if (!workspaceDir && !hasActivity(sessionID)) {
    return { fullSummary: llmSummary }
  }
  const state = getOrCreate(sessionID)
  state.compactionCount++
  const dir =
    workspaceDir ??
    state.workspaceDir ??
    rootState(sessionID)?.workspaceDir ??
    (fs.existsSync(customContextFilePath(process.cwd())) ? process.cwd() : undefined)
  const autoDigest = formatAutoSummary(sessionID, dir)

  // Strip any older auto-tracked block if LLM echoed it back
  const cleanedSummary = llmSummary
    .replace(/\n*## Auto-Tracked Working State \(V2 Digest\)[\s\S]*$/m, "")
    .trim()

  const customContext = dir ? readCustomContextNotes(dir) : undefined
  const customBlock = customContext
    ? `\n\n## Operator / Custom Context Notes (\`.opencode/context/context.md\`)\n${customContext}`
    : ""

  const combined = [cleanedSummary, customBlock.trim(), autoDigest].filter(Boolean).join("\n\n")

  if (!dir) {
    return { fullSummary: combined }
  }

  try {
    const targetDir = contextDir(dir)
    fs.mkdirSync(targetDir, { recursive: true })
    const sessionFile = compactionFilePath(dir, sessionID)
    const latestFile = latestCompactionFilePath(dir)
    const ctxFile = customContextFilePath(dir)

    // Ensure a starter context.md exists so the user can edit it in the Context tab or editor
    if (!fs.existsSync(ctxFile)) {
      fs.writeFileSync(
        ctxFile,
        [
          "<!-- AI RHAMZ Persistent Session Context (.opencode/context/context.md) -->",
          "<!-- Add any persistent notes, targets, scope rules, credentials, offsets, or subagent instructions below. -->",
          "<!-- Everything written below is automatically preserved across all session compactions. -->",
          "",
        ].join("\n"),
        "utf8",
      )
    }

    const fileHeader = [
      `<!-- AI RHAMZ Editable Compaction Checkpoint (Session: ${sessionID}) -->`,
      `<!-- You can edit this file directly or edit .opencode/context/context.md (via the Context tab or editor). -->`,
      `<!-- Any changes saved to this file are automatically loaded into the active <conversation-checkpoint>. -->`,
      "",
    ].join("\n")

    fs.writeFileSync(sessionFile, `${fileHeader}${combined}\n`, "utf8")
    fs.writeFileSync(latestFile, `${fileHeader}${combined}\n`, "utf8")
    state.lastCompactionFile = sessionFile
    return { fullSummary: combined, filePath: sessionFile, customContext }
  } catch {
    return { fullSummary: combined }
  }
}

export function readCustomContextNotes(workspaceDir?: string): string | undefined {
  if (!workspaceDir) return undefined
  try {
    const ctxFile = customContextFilePath(workspaceDir)
    if (!fs.existsSync(ctxFile)) return undefined
    const raw = fs.readFileSync(ctxFile, "utf8")
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").trim()
    return stripped.length > 0 ? stripped : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolves the effective compaction summary for a session message.
 * If the operator or agent edited `.opencode/context/compaction-<sessionID>.md` on disk,
 * the live disk version takes precedence, plus any custom notes in `.opencode/context/context.md`.
 */
export function resolveLiveCheckpointSummary(
  sessionID: string | undefined,
  fallbackSummary: string,
  workspaceDir?: string,
): string {
  const dir =
    workspaceDir ??
    (sessionID ? getWorkspace(sessionID) : undefined) ??
    (fs.existsSync(customContextFilePath(process.cwd())) ? process.cwd() : undefined)
  if (!dir) return fallbackSummary

  let summary = fallbackSummary
  try {
    const candidateFile = sessionID ? compactionFilePath(dir, sessionID) : latestCompactionFilePath(dir)
    if (fs.existsSync(candidateFile)) {
      const diskContent = fs
        .readFileSync(candidateFile, "utf8")
        .replace(/^<!--[\s\S]*?-->\s*/gm, "")
        .trim()
      if (diskContent.length > 0) {
        summary = diskContent
      }
    }
  } catch {
    // Fallback to stored summary
  }

  const customNotes = readCustomContextNotes(dir)
  if (customNotes && !summary.includes(customNotes)) {
    summary = `${summary}\n\n## Live Operator Context (\`.opencode/context/context.md\`)\n${customNotes}`
  }
  return summary
}
