export * as RepoMapIndex from "./repo-map-index.js"

export interface SymbolSpan {
  readonly name: string
  readonly kind: "fn" | "class" | "interface" | "type" | "enum" | "struct" | "trait" | "const"
  readonly line: number
  readonly endLine: number
  readonly exported: boolean
}

const SYMBOL_PATTERNS: Array<{
  re: RegExp
  kind: SymbolSpan["kind"]
  exportedGroup?: number
  nameGroup: number
}> = [
  {
    re: /^(\s*)(export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/,
    kind: "fn",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/,
    kind: "class",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/,
    kind: "interface",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*=/,
    kind: "type",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)\b/,
    kind: "enum",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(export\s+)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    kind: "fn",
    exportedGroup: 2,
    nameGroup: 3,
  },
  {
    re: /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
    kind: "fn",
    nameGroup: 2,
  },
  {
    re: /^(\s*)class\s+([A-Za-z_]\w*)\s*[:(]/,
    kind: "class",
    nameGroup: 2,
  },
  {
    re: /^(\s*)func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)\s*[([[]/,
    kind: "fn",
    nameGroup: 2,
  },
  {
    re: /^(\s*)(pub(?:\([^)]*\))?\s+)?(?:async\s+|unsafe\s+|const\s+)*fn\s+([A-Za-z_]\w*)\s*[<(]/,
    kind: "fn",
    exportedGroup: 2,
    nameGroup: 3,
  },
]

// Temporary per-file outline cache populated only when a single file is read with pagination
const singleFileOutlineCache = new Map<string, SymbolSpan[]>()

export function cacheSingleFileOutline(filePath: string, content: string): SymbolSpan[] {
  if (!content) return []
  const lines = content.split("\n")
  const raw: Array<{ name: string; kind: SymbolSpan["kind"]; line: number; exported: boolean }> = []

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!
    if (lineText.length > 300) continue
    for (const pat of SYMBOL_PATTERNS) {
      const m = pat.re.exec(lineText)
      if (!m) continue
      const indent = (m[1] ?? "").length
      if (indent > 4) break
      const name = m[pat.nameGroup]
      if (!name || name === "if" || name === "for" || name === "while" || name === "switch" || name === "catch") {
        break
      }
      const exported = (pat.exportedGroup !== undefined && Boolean(m[pat.exportedGroup])) || indent === 0
      raw.push({
        name,
        kind: pat.kind,
        line: i + 1,
        exported,
      })
      break
    }
  }

  const symbols: SymbolSpan[] = raw.map((item, idx) => {
    const next = raw[idx + 1]
    const endLine = next ? Math.max(item.line, next.line - 1) : lines.length
    return {
      name: item.name,
      kind: item.kind,
      line: item.line,
      endLine,
      exported: item.exported,
    }
  })

  if (singleFileOutlineCache.size > 64) {
    const oldest = singleFileOutlineCache.keys().next().value
    if (oldest) singleFileOutlineCache.delete(oldest)
  }
  singleFileOutlineCache.set(filePath, symbols)
  return symbols
}

/**
 * Builds a Symbol Outline for unread lines below the read cutoff of the single file being read.
 * Does NOT index the repository.
 */
export function buildSymbolOutlineFooter(
  pageText: string,
  readStartLine: number,
  readEndLine: number,
  absolutePath?: string,
): string {
  const symbols =
    (absolutePath ? singleFileOutlineCache.get(absolutePath) : undefined) ??
    (absolutePath ? cacheSingleFileOutline(absolutePath, pageText) : [])
  if (symbols.length === 0) return ""

  const beyond = symbols.filter((s) => s.line > readEndLine)
  if (beyond.length === 0) return ""

  const formattedBeyond = beyond
    .slice(0, 25)
    .map((s) => `  ${s.exported ? "+" : " "} :${s.line}-${s.endLine} ${s.kind} ${s.name}`)
    .join("\n")
  const more = beyond.length > 25 ? `\n  ... +${beyond.length - 25} more symbols` : ""
  return `Symbols below line ${readEndLine}:\n${formattedBeyond}${more}`
}

export function invalidateSymbolCache(filePath: string): void {
  singleFileOutlineCache.delete(filePath)
}
