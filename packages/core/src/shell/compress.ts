export * as ShellCompress from "./compress.js"

/**
 * Language-agnostic shell output compression for LLM context efficiency.
 *
 * Reduces token waste from test runners, build tools, scanners, and linters
 * by up to 80% without losing actionable error or diagnostic information:
 * 1. Collapses deep stack traces (keeps first 5 frames + "... N more stack frames").
 * 2. Collapses hundreds of passing test lines (PASS / ✓ / ok) while keeping 100% of FAIL output.
 * 3. Strips ASCII spinners, progress bars, and repetitive download/install noise.
 * 4. Collapses consecutive repeated/similar log lines into "... N more similar lines".
 */

// Stack frame patterns across JS/TS, Python, Java/Kotlin, Rust, Ruby, C#, Go
const STACK_FRAME_RE =
  /^\s+at\s+|^\s+File\s+"[^"]+",\s+line\s+\d+|^\s+at\s+[\w.$]+\(|^\s+\d+:\s+(?:0x[0-9a-fA-F]+\s+-\s+)?[\w:$]+|^\s+from\s+\/\S+:\d+:in\s+/

// Passing test lines across Jest, Vitest, Bun test, Pytest, Go test, Cargo test, RSpec, TAP, Maven/Gradle
const PASS_LINE_RE =
  /^\s*(?:✓|✔|√|PASS|pass|ok|OK)\s+|^\s*(?:PASS|ok)\s+[\w/.-]+|^ok\s+\d+\s|\bPASSED\s*$|^---\s*PASS:|^test\s+\S+\s+\.\.\.\s+ok\s*$/

// Explicit failure/error lines that must NEVER be suppressed as passing or noise
const FAIL_KEEP_RE = /\b(?:FAIL|FAILED|ERROR|ERR!|PANIC|Exception|Traceback|AssertionError|fatal:)\b/i

// ASCII spinners, progress bars, and repetitive download/fetching noise
const NOISE_RE =
  /^\s*[\\/|─━░▓█▒■□◻◼⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷]+\s*$|^\s*\d{1,3}%\s*[|█▓░▒=\->]+\s*.*$|\[[█▓░▒=\->\s]{6,}\]\s*\d{1,3}%|^(?:Downloading|Fetching|Installing|Resolving|Extracting|Unpacking)\b.*\.\.\.\s*$/i

const MAX_STACK_FRAMES = 5
const MAX_PASS_LINES = 3

export interface CompressResult {
  readonly text: string
  readonly compressed: boolean
  readonly originalLines: number
  readonly finalLines: number
}

function collapseRepeated(lines: readonly string[]): string[] {
  const out: string[] = []
  let repeatPattern: string | null = null
  let repeatCount = 0

  const flush = () => {
    if (repeatCount > 1) {
      out.push(`  ... ${repeatCount - 1} more similar lines`)
    }
    repeatPattern = null
    repeatCount = 0
  }

  for (const line of lines) {
    if (
      STACK_FRAME_RE.test(line) ||
      FAIL_KEEP_RE.test(line) ||
      (line.includes("... ") &&
        (line.includes("more stack frames") ||
          line.includes("passing tests omitted") ||
          line.includes("more similar lines")))
    ) {
      if (repeatCount > 0) flush()
      out.push(line)
      continue
    }

    const normalized = line
      .replace(/^\s*\d{1,5}[:.)\]|]\s*/, "")
      .replace(/\b0x[0-9a-fA-F]+\b/g, "0xHEX")
      .replace(/\d+/g, "N")
      .trim()

    if (normalized.length > 0 && repeatPattern !== null && normalized === repeatPattern) {
      repeatCount++
      continue
    }

    if (repeatCount > 0) flush()
    out.push(line)
    repeatPattern = normalized.length > 0 ? normalized : null
    repeatCount = normalized.length > 0 ? 1 : 0
  }

  if (repeatCount > 1) flush()
  return out
}

export function compressFull(raw: string): CompressResult {
  if (!raw || raw.length < 120) {
    const count = raw ? raw.split("\n").length : 0
    return { text: raw, compressed: false, originalLines: count, finalLines: count }
  }

  const lines = raw.split("\n")
  if (lines.length < 6) {
    return { text: raw, compressed: false, originalLines: lines.length, finalLines: lines.length }
  }

  const out: string[] = []
  let stackFrames = 0
  let inStack = false
  let passLines = 0
  let totalPassSuppressed = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // 1. Stack traces: keep first MAX_STACK_FRAMES frames, collapse the remainder
    if (STACK_FRAME_RE.test(line)) {
      if (!inStack) {
        inStack = true
        stackFrames = 0
      }
      stackFrames++
      if (stackFrames <= MAX_STACK_FRAMES) {
        out.push(line)
      } else if (stackFrames === MAX_STACK_FRAMES + 1) {
        let remaining = 1
        while (i + 1 < lines.length && STACK_FRAME_RE.test(lines[i + 1]!)) {
          i++
          remaining++
        }
        out.push(`    ... ${remaining} more stack frames`)
      }
      continue
    }
    if (inStack) {
      inStack = false
      stackFrames = 0
    }

    // 2. Passing test lines (never suppress lines containing FAIL/ERROR keywords)
    if (!FAIL_KEEP_RE.test(line) && PASS_LINE_RE.test(line)) {
      passLines++
      if (passLines <= MAX_PASS_LINES) {
        out.push(line)
      } else {
        totalPassSuppressed++
      }
      continue
    }

    // 3. Progress bars, spinners, and repetitive download noise
    if (!FAIL_KEEP_RE.test(line) && NOISE_RE.test(line)) {
      continue
    }

    if (totalPassSuppressed > 0) {
      out.push(`  ... ${totalPassSuppressed} passing tests omitted`)
      totalPassSuppressed = 0
    }
    passLines = 0
    out.push(line)
  }

  if (totalPassSuppressed > 0) {
    out.push(`  ... ${totalPassSuppressed} passing tests omitted`)
  }

  const collapsed = collapseRepeated(out)

  // Only use compressed output if it saves at least 10% of lines (or >= 15 lines)
  const savedLines = lines.length - collapsed.length
  if (savedLines < Math.min(15, Math.ceil(lines.length * 0.1))) {
    return {
      text: raw,
      compressed: false,
      originalLines: lines.length,
      finalLines: lines.length,
    }
  }

  const pct = Math.round((savedLines / lines.length) * 100)
  const footer = `[ShellCompress: ${lines.length} -> ${collapsed.length} lines (-${pct}% noise)]`
  return {
    text: `${collapsed.join("\n")}\n${footer}`,
    compressed: true,
    originalLines: lines.length,
    finalLines: collapsed.length,
  }
}

export function compress(raw: string): string {
  return compressFull(raw).text
}
