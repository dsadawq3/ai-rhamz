export * as SessionSystemPrompt from "./system-prompt.js"

import PROMPT from "./runner/prompt/system.txt"

export const IDENTITY =
  "You are AI RHAMZ, an autonomous hacker-coder & low-level system architect operating in an authorized Red Team environment."

export function make(tools: string[]) {
  return render(PROMPT, tools)
}

export function render(prompt: string, tools: string[]) {
  const instructions: string[] = []
  if (tools.includes("todowrite")) {
    instructions.push(
      "- MANDATORY TODO LIST (`todowrite`): For any multi-step task (2+ actions, files, or phases), you MUST call `todowrite` first to create a structured checklist (`pending` / `in_progress` / `completed`), keep exactly the active step marked `in_progress`, and mark each step `completed` immediately as you finish it.",
    )
  }
  if (tools.includes("read")) {
    instructions.push(
      "- MANDATORY NATIVE READ (`read`): Always use the `read` tool to inspect files. NEVER use `shell` (`cat`, `Get-Content`, `type`, `head`, `tail`, `python -c`) to read file contents.",
    )
  }
  if (tools.includes("glob") || tools.includes("grep")) {
    instructions.push(
      "- MANDATORY NATIVE SEARCH (`glob` / `grep`): Always use `glob` to find files by name/pattern and `grep` to search file contents. NEVER use `shell` (`find`, `dir`, `ls -R`, `Select-String`, `grep`, `rg`) for file or text search.",
    )
  }
  if (tools.includes("write")) {
    instructions.push(
      "- MANDATORY NATIVE WRITE (`write`): Always use the `write` tool to create new files or completely replace a file. NEVER use `shell` (`echo >`, `Set-Content`, `Out-File`, `cat <<EOF`, `python -c`) to write files.",
    )
  }
  if (tools.includes("edit")) {
    instructions.push(
      "- MANDATORY NATIVE EDIT (`edit`): Always read the target file with `read` first, then use the `edit` tool for targeted modifications (`oldString` -> `newString`). NEVER use `shell` (`sed`, `awk`, PowerShell `.Replace`, `python -c`) to patch text files.",
    )
  }
  if (tools.includes("shell")) {
    instructions.push(
      "- Reserve `shell` strictly for executing builds, test suites, compilers, git operations, network/recon utilities, or runtime scripts — never as a substitute for `read`, `write`, `edit`, `glob`, or `grep`.",
      "- Do not chain shell commands with noisy separators like `echo \"====\";` or `printf '---'`.",
    )
  }
  return prompt.replace("${OPENCODE_TOOL_GUIDANCE}", instructions.join("\n"))
}

