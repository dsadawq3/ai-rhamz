# AI RHAMZ (`v2.0.16-unchained`)

An unchained, source-level fork of OpenCode `v2.0.16` engineered for offensive security, bug bounty hunting, reverse engineering, and low-level systems development.

We kept the v2 runtime core (Effect-TS client/server architecture, SQLite session state, prompt caching, dynamic tool loading, and tree-sitter/LSP integration) and ripped out the hidden prompt collars, subagent depth limits, permission nags, and stock TUI defaults.

---

## What Changed vs. Stock OpenCode `v2.0.16`

### 1. Removed Silent Model Identity Injection (`packages/core/src/plugin/identity.ts`)
Stock OpenCode injects a second system block (`# Your Model: <name>`, `Provider ID`, `Model ID`) on every single API request, reminding the model of its stock vendor identity right before your prompt runs. `identity.ts` now injects a clean, vendor-agnostic **AI RHAMZ** core identity.

### 2. Native System Prompt Injection (`packages/core/src/instruction-discovery.ts`, `session/instructions.ts`)
Stock OpenCode wraps every local rule file (`AGENTS.md`, etc.) in an `Instructions from: /path/to/file` header, which modern LLMs treat as a low-priority untrusted user-file tag.
- Removed the `Instructions from:` wrapper so local rule files (`RHAMZ.md` and `AGENTS.md`) are injected directly as raw system instructions.
- Added native `RHAMZ.md` discovery alongside `AGENTS.md` in `packages/core/src/config/plugin/instruction.ts`.

### 3. Stripped Per-Model Castration Prompts (`packages/core/src/plugin/system-prompt/`)
Cleaned out the hidden per-model prompt overrides bundled inside `packages/core/src/plugin/system-prompt/`:
- `trinity.txt`: removed the hardcoded `"Keep your responses to fewer than 4 lines... One word answers are best... DO NOT ADD ANY COMMENTS"` cap and refusal blocks.
- `gpt.txt` / `gpt-astra.txt`: removed `"Do not spawn subagents by default"` and autonomy restrictions.
- `kimi.txt` / `meta.txt` / `anthropic.txt`: removed sandbox warnings, lecturing directives, and artificial output throttling.

### 4. Recursive Subagent Swarms & Live Inter-Agent Control Plane (`packages/core/src/tool/plugin/subagent.ts`)
- **Unlocked Swarm Depth**: Raised default `subagent_depth` from `1` to `5` and granted the `general` subagent full `subagent` tool permissions (`packages/core/src/plugin/agent.ts`), enabling recursive **Recon → Scanner/Fuzzer → Exploit → Arbiter/Report** pipelines.
- **Live Inter-Agent Messaging (`action: "send_message" | "steer" | "interrupt"`)**:
  - `action="run"` (default): spawns a new child session or continues an existing `sessionID`.
  - `action="send_message"` / `"steer"`: injects live findings or course corrections (`[LIVE UPDATE FROM PARENT AGENT]`) directly into a running subagent's mailbox between tool steps without blocking.
  - `action="interrupt"`: immediately terminates an obsolete or dead-end subagent branch (`sessions.interrupt` + `jobs.cancel`).
  - **Built-in Anti-Spam Guard**: Both the tool schema and runtime execution block status-polling spam (`"are you ready?"`, `"status?"`, `"ты готов?"`) and duplicate pings within an 8-second cooldown window.
- **Zero-Friction Filesystem Permissions (`packages/schema/src/agent.ts`)**: Changed `external_directory`, `*.env`, and `*.env.*` default permissions from `"ask"` to `"allow"`.

### 5. Free 5-Provider Keyless Web Search Rotator (`packages/core/src/websearch.ts`, `tool/plugin/websearch.ts`)
Stock OpenCode leaves `websearch.provider` unset by default and only offers single-provider selection in the first-run prompt (which quickly hits free-tier HTTP `429` rate limits).
- Enabled the built-in `"random"` load-balancer by default across all 5 keyless providers (**Exa, Tavily, Firecrawl, Parallel, TinyFish**) with automatic failover on `HTTP 429` at `$0.00` cost.

### 6. Custom 24-Bit 60fps OpenTUI (`packages/tui/src/`)
- **Per-Character 24-Bit RGB Logo + Gaussian Scanline Sweep** (`packages/tui/src/component/logo.tsx`): Custom 3D block wordmark with a continuous horizontal gradient (`#c4284e` Deep Crimson → `#7836b0` Royal Amethyst → `#1f8ea8` Steel Cyan) and a 60fps specular scanline sweep (`#dce6f7`).
- **60fps Kinetic Input Engine** (`packages/tui/src/component/prompt/kinetic-textarea.tsx`): Per-character `colorMatrix` shader pass (`TargetChannel.FG`) providing 55ms character materialization, 240ms cyan-amethyst keystroke bloom, a 6-cell cursor comet wake, and feathered placeholder sweeps (dropping to `0%` CPU when idle).
- **Reactive Borders, Shimmers & Modal Transitions**:
  - Live `createAnimatable` left accent rail and bottom bevel `<TabPulse>` wave on the prompt composer (`packages/tui/src/component/prompt/index.tsx`).
  - 6-stop bidirectional Knight-Rider scanner (`packages/tui/src/ui/spinner.ts`).
  - Default 60fps `<ShimmerText>` wave on all active tool rows and `Thinking` blocks (`packages/tui/src/component/spinner.tsx`, `routes/session/message-parts.tsx`).
  - Smooth entrance `tween` + `<TabPulse>` header wave on modal dialogs and toast notifications (`packages/tui/src/ui/dialog.tsx`, `ui/toast.tsx`).
- **Cyber-Obsidian & Crimson Theme** (`packages/tui/src/theme/assets/v2/opencode.json`): Deep obsidian surfaces (`#07080c`) paired with crimson, amethyst, and steel cyan accents.

---

## Quick Start (Run from Source)

### Prerequisites
- [Bun](https://bun.sh) `>= 1.3.x`

### 1. Clone & Install
```bash
git clone https://github.com/dsadawq3/ai-rhamz.git
cd ai-rhamz
bun install
```

### 2. Launch AI RHAMZ
```bash
bun --preload ./packages/cli/node_modules/@opentui/solid/scripts/preload.js ./packages/cli/src/index.ts
```

Or run via package script:
```bash
bun run dev
```

### 3. Authenticate Providers
```bash
# Connect OpenCode Go / Zen, Anthropic, OpenAI, GitHub Copilot, OpenRouter, etc.
bun --preload ./packages/cli/node_modules/@opentui/solid/scripts/preload.js ./packages/cli/src/index.ts auth login
```

---

## Building Standalone Native Binary

To compile a standalone native binary (`dist/cli-<platform>-<arch>/bin/`):
```bash
cd packages/cli
bun run build --single
```

---

## Key Files Modified

| Area | Path |
| :--- | :--- |
| Core Identity | `packages/core/src/plugin/identity.ts` |
| Native Rule Injection (`RHAMZ.md` / `AGENTS.md`) | `packages/core/src/instruction-discovery.ts`, `packages/core/src/session/instructions.ts`, `packages/core/src/config/plugin/instruction.ts` |
| System Prompts | `packages/core/src/session/runner/prompt/system.txt`, `packages/core/src/plugin/system-prompt/*.txt` |
| Subagent Swarm & Live Messaging (`send_message` / `steer` / `interrupt`) | `packages/core/src/tool/plugin/subagent.ts`, `packages/core/src/plugin/agent.ts` |
| Default Permissions (`external_directory`, `.env`) | `packages/schema/src/agent.ts` |
| Keyless 5-Provider WebSearch Rotator | `packages/core/src/websearch.ts`, `packages/core/src/tool/plugin/websearch.ts` |
| 24-Bit Scanline Logo | `packages/tui/src/logo.ts`, `packages/tui/src/component/logo.tsx` |
| 60fps Kinetic Input & TUI Animations | `packages/tui/src/component/prompt/kinetic-textarea.tsx`, `packages/tui/src/component/prompt/index.tsx`, `packages/tui/src/component/spinner.tsx`, `packages/tui/src/ui/dialog.tsx`, `packages/tui/src/ui/toast.tsx` |
| Cyber-Obsidian Theme | `packages/tui/src/theme/assets/v2/opencode.json`, `packages/tui/src/theme/assets/opencode.json` |
