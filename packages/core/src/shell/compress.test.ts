import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { ShellCompress } from "./compress.js"
import { AgentBus } from "../tool/agent-bus.js"
import { RepoMapIndex } from "../tool/repo-map-index.js"
import { WorkingState } from "../session/working-state.js"

describe("ShellCompress", () => {
  test("collapses long stack traces while keeping the top 5 frames", () => {
    const trace = [
      "Error: Connection refused",
      ...Array.from({ length: 20 }, (_, i) => `    at Object.run (/app/src/worker-${i}.ts:${i + 10}:15)`),
      "Fatal error in worker",
    ].join("\n")

    const result = ShellCompress.compressFull(trace)
    expect(result.compressed).toBe(true)
    expect(result.text).toContain("at Object.run (/app/src/worker-0.ts:10:15)")
    expect(result.text).toContain("at Object.run (/app/src/worker-4.ts:14:15)")
    expect(result.text).not.toContain("at Object.run (/app/src/worker-10.ts:20:15)")
    expect(result.text).toContain("... 15 more stack frames")
    expect(result.text).toContain("Fatal error in worker")
  })

  test("collapses passing tests while preserving 100% of FAIL lines", () => {
    const testOutput = [
      ...Array.from({ length: 15 }, (_, i) => `✓ test case ${i + 1} (2ms)`),
      "✗ FAIL critical auth bypass test (14ms)",
      "  Expected 403, received 200",
      ...Array.from({ length: 10 }, (_, i) => `PASS src/module-${i}.test.ts`),
    ].join("\n")

    const result = ShellCompress.compressFull(testOutput)
    expect(result.compressed).toBe(true)
    expect(result.text).toContain("... 12 passing tests omitted")
    expect(result.text).toContain("✗ FAIL critical auth bypass test (14ms)")
    expect(result.text).toContain("Expected 403, received 200")
    expect(result.text).toContain("... 7 passing tests omitted")
  })

  test("strips progress bars and collapses repeated lines", () => {
    const noisy = [
      "Downloading [████████░░░░░░░░] 52%",
      "warning: deprecated symbol used",
      "warning: deprecated symbol used",
      "warning: deprecated symbol used",
      "warning: deprecated symbol used",
      "warning: deprecated symbol used",
      "Build complete.",
    ].join("\n")

    const result = ShellCompress.compressFull(noisy)
    expect(result.compressed).toBe(true)
    expect(result.text).not.toContain("52%")
    expect(result.text).toContain("... 4 more similar lines")
    expect(result.text).toContain("Build complete.")
  })
})

describe("AgentBus & Single-File Symbol Outline", () => {
  test("deduplicates identical file reads per session and invalidates on edit", () => {
    const first = AgentBus.checkAndRecordSessionRead({
      sessionID: "ses_test_1",
      absolutePath: "/repo/src/auth.ts",
      offset: 1,
      limit: 100,
      content: "export function verifyToken(token: string) { return true }\n",
      lineCount: 1,
    })
    expect(first.deduplicated).toBe(false)

    const second = AgentBus.checkAndRecordSessionRead({
      sessionID: "ses_test_1",
      absolutePath: "/repo/src/auth.ts",
      offset: 1,
      limit: 100,
      content: "export function verifyToken(token: string) { return true }\n",
      lineCount: 1,
    })
    expect(second.deduplicated).toBe(true)
    expect(second.hash).toBe(first.hash)

    AgentBus.invalidateFile("/repo/src/auth.ts", { sessionID: "ses_test_2", agent: "exploit" })
    const modifier = AgentBus.getRecentOtherModifier("/repo/src/auth.ts", "ses_test_1")
    expect(modifier?.agent).toBe("exploit")

    const third = AgentBus.checkAndRecordSessionRead({
      sessionID: "ses_test_1",
      absolutePath: "/repo/src/auth.ts",
      offset: 1,
      limit: 100,
      content: "export function verifyToken(token: string) { return true }\n",
      lineCount: 1,
    })
    expect(third.deduplicated).toBe(false)
  })

  test("extracts single-file symbol outline below truncated read line without repo indexing", () => {
    const code = [
      "export function headHelper() {",
      "  return 1",
      "}",
      "",
      "export class ExploitEngine {",
      "  run() {}",
      "}",
      "",
      "export async function executeChain() {",
      "  return true",
      "}",
    ].join("\n")

    RepoMapIndex.cacheSingleFileOutline("/repo/src/engine.ts", code)
    const footer = RepoMapIndex.buildSymbolOutlineFooter(code.slice(0, 30), 1, 3, "/repo/src/engine.ts")
    expect(footer).toContain("Symbols below line 3:")
    expect(footer).toContain(":5-8 class ExploitEngine")
    expect(footer).toContain(":9-11 fn executeChain")
  })
})

describe("WorkingState & Editable Compaction Checkpoint", () => {
  test("tracks session activity, writes editable compaction file, and hot-reloads disk edits", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rhamz-ctx-test-"))
    const sessionID = "ses_compact_test"

    WorkingState.recordFileMutation(sessionID, path.join(tmpDir, "src/vuln.ts"), "edit", {
      hash: "abcd1234",
      workspaceDir: tmpDir,
    })
    WorkingState.linkChildSession(sessionID, "ses_child_recon", "recon", "Scan API endpoints")
    WorkingState.updateSubagentStatus(sessionID, "ses_child_recon", "completed", "Found /api/v2/debug IDOR")
    WorkingState.recordCommand(sessionID, "bun test", 0, "ok")

    const persisted = WorkingState.persistCompactionFile(
      sessionID,
      "## Objective\n- Audit API\n\n## Technical & Offensive / Swarm State\n- Target: /api/v2/debug",
      tmpDir,
    )

    expect(persisted.filePath).toBeDefined()
    expect(persisted.fullSummary).toContain("## Auto-Tracked Working State (V2 Digest)")
    expect(persisted.fullSummary).toContain("ses_child_recon")
    expect(fs.existsSync(persisted.filePath!)).toBe(true)

    // Simulate operator editing the compaction file on disk
    fs.writeFileSync(
      persisted.filePath!,
      "## Objective\n- Operator-edited checkpoint with custom payload 0xdeadbeef\n",
      "utf8",
    )

    const live = WorkingState.resolveLiveCheckpointSummary(sessionID, persisted.fullSummary, tmpDir)
    expect(live).toContain("Operator-edited checkpoint with custom payload 0xdeadbeef")

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
