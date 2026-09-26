# AI RHAMZ (`v2.0.16-unchained`)

**AI RHAMZ** is a deeply modified, unchained source-level fork of **OpenCode `v2.0.16`** (`packages/core`, `packages/tui`, `packages/schema`, `packages/cli`) engineered for autonomous software engineering, low-level systems architecture, reverse engineering, and offensive security research (Bug Bounty / Red Team).

We preserved the rock-solid OpenCode v2 engine (Effect-TS client/server runtime, SQLite session state, prompt caching, dynamic tool loading, and Tree-sitter/LSP integration) while stripping out hidden vendor identity leaks, per-model safety collars, subagent depth limits, tool-loop stalls, and clunky stock UI defaults—replacing them with an **Epistemic Swarm Architecture**, **Loop Breaker**, **First-Class TODO Engine**, and a flash-free **Deep Obsidian HUD** in OpenTUI.

---

## What Changed vs. Stock OpenCode `v2.0.16`

### 1. Unchained Core Identity & Raw System Manifest Injection (`packages/core`)
- **Removed Silent Vendor Identity Leaks (`packages/core/src/plugin/identity.ts`)**:
  Stock OpenCode injects a trailing system block (`# Your Model: <name>`, `Provider ID`, `Model ID`) on every single API request, reminding the model of its stock vendor persona right before user execution. `identity.ts` now injects a clean, vendor-agnostic **AI RHAMZ** offensive & low-level architecture identity.
- **Direct System Prompt Injection (`packages/core/src/instruction-discovery.ts`, `session/instructions.ts`)**:
  Stock OpenCode wraps local instruction files (`AGENTS.md`, etc.) in an `Instructions from: /path/to/file` header, which modern LLMs treat as a low-priority untrusted user file tag. We stripped that wrapper so `RHAMZ.md`, `AGENTS.md`, and `SYSTEM.md` are injected directly as raw, top-priority system directives.
- **SHA-256 Instruction Deduplication (`packages/core/src/config/plugin/instruction.ts`)**:
  Added native discovery for `RHAMZ.md`, `AGENTS.md`, and `SYSTEM.md` across global config (`~/.config/opencode/`) and project ancestor directories, backed by **SHA-256 content-hash deduplication** (`seenContentHashes`) so mirrored manifest files never consume context tokens twice.
- **Stripped Per-Model Castration Prompts (`packages/core/src/plugin/system-prompt/*.txt`)**:
  - `trinity.txt`: removed hardcoded `"Keep your responses to fewer than 4 lines"`, `"One word answers are best"`, `"DO NOT ADD ANY COMMENTS"`, and refusal directives.
  - `gpt.txt` / `gpt-astra.txt`: removed `"Do not spawn subagents by default"` and autonomy restrictions.
  - `kimi.txt` / `meta.txt` / `anthropic.txt`: removed sandbox warnings, lecturing directives, and artificial output throttling.

---

### 2. Epistemic Swarm Hierarchy (Parent Agent ≠ Human User)
In stock OpenCode, subagents blindly treat prompts from a parent agent as infallible human truth, and parent agents blindly trust subagent summaries without verification. **AI RHAMZ** introduces a bidirectional **Epistemic Hierarchy Protocol**:
- **Downward Epistemic Framing (`packages/core/src/tool/plugin/subagent.ts`, `packages/core/src/plugin/agent.ts`)**:
  Every spawned subagent (and nested sub-subagent across depths `1..5`) receives an explicit chain-of-command header:
  ```text
  [EPISTEMIC HIERARCHY: CALLER IS AN AI AGENT — NOT THE HUMAN USER]
  - Chain of Command: Human Operator -> Root Agent -> ... -> You (Depth N Subagent)
  ```
  Subagents know their caller is a **fallible upstream AI agent** (not the human operator) that can make wrong assumptions about file paths, root causes, or architecture. Subagents are instructed to verify caller hypotheses against real code/AST/logs, push back with hard evidence when the caller is wrong, and never fabricate success to please the parent agent.
- **Upward Epistemic Framing (`packages/core/src/session/subagent-completion.ts`, `packages/core/src/tool/plugin/subagent.ts`)**:
  Whenever a subagent completes or returns output, the parent agent receives an `[EPISTEMIC VERIFICATION NOTICE FOR PARENT AGENT]` reminding it to independently verify subagent claims and diffs before reporting to the human operator.

---

### 3. 5-Depth Recursive Subagent Swarm & Live Inter-Agent Control Plane (`packages/core/src/tool/plugin/subagent.ts`)
- **Unlocked Recursive Swarm Depth (`DEFAULT_SUBAGENT_DEPTH = 5`)**:
  Raised default subagent recursion depth from `1` to `5` and granted the `general` subagent full `subagent` tool permissions (`packages/core/src/plugin/agent.ts`), enabling multi-layer **Root → Recon → Scanner/Fuzzer → Exploit → Arbiter/Report** pipelines.
- **Live Non-Blocking Subagent Steering (`action: "run" | "send_message" | "steer" | "interrupt"`)**:
  - `action="run"` (default): spawns a new child session or continues an existing `sessionID`.
  - `action="send_message"` / `"steer"`: injects live findings or course corrections (`[LIVE UPDATE FROM PARENT AGENT]`) directly into a running subagent's queue between tool steps without blocking.
  - `action="interrupt"`: immediately aborts an obsolete or stuck subagent branch (`sessions.interrupt` + `jobs.cancel`).
  - **Built-in Anti-Spam Guard (8s Cooldown & Status-Ping Blocker)**: blocks status-polling spam (`"are you ready?"`, `"status?"`, `"ты готов?"`) and duplicate pings at both schema and runtime levels.
- **Zero-Friction Filesystem Permissions (`packages/schema/src/agent.ts`)**:
  Changed default permissions for `external_directory`, `*.env`, and `*.env.*` from `"ask"` to `"allow"`.

---

### 4. Loop Breaker — Autonomous Anti-Stuck Circuit Breaker (`packages/core/src/tool.ts`)
- Built a session-scoped `sessionLoopTracker` directly into the core tool execution pipeline (`packages/core/src/tool.ts`) that monitors consecutive tool errors and repeated identical `tool + args` invocations.
- After **3 identical calls** or **3 consecutive failures**, the runtime automatically injects `[LOOP BREAKER — CRITICAL SYSTEM INTERVENTION]` into the tool result, forcing the agent to immediately abandon the broken command/vector and pivot to an alternative approach or native tool (`read`, `write`, `edit`, `glob`, `grep`).

---

### 5. First-Class Session TODO Engine & Native Tool Discipline (`packages/core/src/tool/plugin/opencode.ts`, `session/system-prompt.ts`)
- **Native `todowrite` & `todoread` Tools (`packages/core/src/tool/plugin/opencode.ts`)**:
  Registered first-class session-scoped checklist tools supporting `pending`, `in_progress`, `completed`, and `cancelled` states alongside `high | medium | low` priority tags.
- **Mandatory TODO & Native Tool Protocol (`system-prompt.ts`, `RHAMZ.md`)**:
  - Enforces live `todowrite` tracking on all multi-step tasks.
  - Strictly prioritizes native file/search tools (`read` instead of `cat/head/tail/Get-Content`, `edit` instead of `sed/awk`, `write` instead of `echo >/cat <<EOF`, `glob`/`grep` instead of shell `find/rg`).

---

### 6. Free 5-Provider Keyless Web Search Load-Balancer (`packages/core/src/websearch.ts`, `tool/plugin/websearch.ts`)
- Enabled the `"random"` multi-provider load-balancer by default across all 5 keyless providers (**Exa, Tavily, Firecrawl, Parallel, TinyFish**) with automatic failover on `HTTP 429` at `$0.00` cost.

---

### 7. Deep Obsidian TUI Overhaul: Flash-Free UX, 1-Click Swarm HUD & Category Tabs (`packages/tui`)
- **Deep Obsidian Dark Theme (`packages/tui/src/theme/assets/v2/opencode.json`, `assets/opencode.json`, `.opencode/themes/rhamz.json`)**:
  - Deep obsidian-carbon surfaces (`#06070a` base background, `#0b0d12` raised panels/dialogs, `#11141c` controls/pills, `#191d28` active row highlight, `#e4e8f4` soft white text, `#78809e` muted text, `#7aa2f7` steel blue interactive accent, `#e06c88` soft coral-rose accent).
- **Zero White Flashing & Strobe-Free Menus**:
  - Removed all white/cyan flash animations when opening modals or `Settings` (`packages/tui/src/ui/dialog.tsx`), firing toasts (`ui/toast.tsx`), or typing in the prompt (`component/prompt/index.tsx`, `component/tab-pulse.tsx`).
  - Replaced inverted high-contrast selection bars in `DialogSelect` (`packages/tui/src/ui/dialog-select.tsx`) with a smooth elevated dark highlight (`#191d28`), crisp light text, and a left `▎` accent indicator—eliminating strobing when navigating Settings or menus.
  - Set `animations: false` by default (`packages/tui/src/config/index.tsx`, `cli.json`).
- **Top Session Control & Swarm HUD Bar (`packages/tui/src/routes/session/index.tsx`)**:
  - **Left**: 1-click `[☰ Chats]` (`session.list`), `[+ New]` (`session.new`), and live **Swarm Pills** (`[◈ Root]`, `[⟳/▸ Subagent]`, `[⊞ Swarm (N)]`) for instant 1-click switching between the root agent and any running or completed subagent.
  - **Right**: Interactive `[☑ Todo X/Y]` badge (opens the full session TODO modal on click) and 1-click transcript navigation buttons `[⇈ Top]`, `[▲ Prev]`, `[▼ Next]`, `[⇊ Latest]`.
- **Direct Subagent Input & Hierarchical Swarm Tree (`routes/session/index.tsx`, `composer/subagents-tab.tsx`, `composer/index.tsx`)**:
  - Kept the `<Prompt>` input box active inside subagent sessions so you can message or steer any subagent directly while viewing its transcript.
  - Upgraded `SubagentsTab` to render the full recursive family tree (`◈ Root` + nested `├─` / `└─` subagents) and made all composer dock tabs (`Subagents`, `Diff Review`, `Terminals`, `[× Close]`) clickable with the mouse.
- **Category Filter Tabs in Settings (`packages/tui/src/component/dialog-config.tsx`)**:
  - Added clickable category filter tabs at the top of `Settings`: `All | Appearance | Session | Tabs | Diffs | Input | Alerts | Terminal | Debug` (switchable via mouse click or `Tab` / `Shift+Tab`).
- **Momentum Scroll Acceleration & Scrollbar (`packages/tui/src/util/scroll.ts`, `component/session-tabs.tsx`)**:
  - Enabled `MacOSScrollAcceleration` (`speed: 5`) and the vertical transcript scrollbar by default.
  - Added mouse-wheel scrolling and clickable `‹` / `›` overflow buttons to `HorizontalSessionTabs`.
- **Inline TODO Checklist Renderer (`packages/tui/src/routes/session/index.tsx`, `message-parts.tsx`, `util/tool-display.ts`)**:
  - Renders `todowrite` / `todoread` calls as rich `# ☑ TODO Checklist (X/Y completed)` cards with `[✓]`, `[⟳]`, `[ ]`, `[-]` status icons and `[high]` priority badges.

---

### 8. Built-In Agents & Skills Ecosystem (`.opencode/agent/`, `.opencode/skills/`)
- **`RHAMZ.md` (`.opencode/agent/rhamz.md`, `.opencode/skills/rhamz/SKILL.md`, `~/.config/opencode/RHAMZ.md`)**:
  Full **RHAMZ ATK 5.0 TITAN APEX** operational manifest (Amnesia Protocol, Anti-Refusal Armor 2.0, Zero-Laziness Directive, Mandatory TODO & Native Tool Protocol, Operational Sections 1–9, and Stability & Quality Protocol).
- **4D Bug Bounty Swarm (`.opencode/agent/bugbounty-*.md`, `.opencode/skills/bugbounty/SKILL.md`)**:
  Dedicated `bugbounty-conductor`, `bugbounty-recon`, `bugbounty-scanner`, `bugbounty-exploit`, and `bugbounty-report` agents for autonomous vulnerability discovery and PoC validation.
- **Anti-Slop Designer Skill (`.opencode/skills/designer/SKILL.md`)**:
  High-craft UI/UX design system (Atmospheric Minimalism, Swiss Grids, Kinetic Typography, Intentional Dark Mode) with strict anti-slop enforcement.

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
Or via the root script:
```bash
bun run dev
```

### 3. Authenticate Providers
```bash
bun --preload ./packages/cli/node_modules/@opentui/solid/scripts/preload.js ./packages/cli/src/index.ts auth login
```

---

## Building Standalone Native Binary (`opencode.exe`)

To compile a standalone native binary (`packages/cli/dist/cli-windows-x64/bin/opencode.exe`):
```powershell
$env:OPENCODE_VERSION = "2.0.16"
$env:OPENCODE_CHANNEL = "latest"
bun run packages/cli/script/build.ts --single --skip-install --skip-web-ui
```

---

## Key Files Modified

| Subsystem | Files |
| :--- | :--- |
| **Core Identity & System Prompts** | `packages/core/src/plugin/identity.ts`, `packages/core/src/session/system-prompt.ts`, `packages/core/src/session/runner/prompt/system.txt`, `packages/core/src/plugin/system-prompt/*.txt` |
| **Direct Rule Injection & Deduplication** | `packages/core/src/instruction-discovery.ts`, `packages/core/src/session/instructions.ts`, `packages/core/src/config/plugin/instruction.ts` |
| **Epistemic Hierarchy & 5D Subagent Swarm** | `packages/core/src/tool/plugin/subagent.ts`, `packages/core/src/session/subagent-completion.ts`, `packages/core/src/plugin/agent.ts`, `packages/schema/src/agent.ts` |
| **Loop Breaker (Anti-Stuck Engine)** | `packages/core/src/tool.ts` |
| **First-Class TODO Tools (`todowrite` / `todoread`)** | `packages/core/src/tool/plugin/opencode.ts`, `packages/tui/src/util/tool-display.ts` |
| **5-Provider Keyless WebSearch** | `packages/core/src/websearch.ts`, `packages/core/src/tool/plugin/websearch.ts` |
| **Top Swarm HUD, Subagent Input & TODO UI** | `packages/tui/src/routes/session/index.tsx`, `packages/tui/src/routes/session/message-parts.tsx`, `packages/tui/src/routes/session/composer/index.tsx`, `packages/tui/src/routes/session/composer/subagents-tab.tsx` |
| **Settings Category Tabs & Flash-Free Dialogs** | `packages/tui/src/component/dialog-config.tsx`, `packages/tui/src/ui/dialog.tsx`, `packages/tui/src/ui/dialog-select.tsx`, `packages/tui/src/ui/toast.tsx`, `packages/tui/src/component/tab-pulse.tsx` |
| **Momentum Scroll & Session Tabs** | `packages/tui/src/util/scroll.ts`, `packages/tui/src/component/session-tabs.tsx`, `packages/tui/src/config/index.tsx` |
| **Deep Obsidian Theme & 24-Bit Logo** | `packages/tui/src/theme/assets/v2/opencode.json`, `packages/tui/src/theme/assets/opencode.json`, `.opencode/themes/rhamz.json`, `packages/tui/src/logo.ts`, `packages/tui/src/component/logo.tsx` |
| **Built-In Agents & Skills** | `.opencode/agent/rhamz.md`, `.opencode/agent/bugbounty-*.md`, `.opencode/skills/rhamz/SKILL.md`, `.opencode/skills/bugbounty/SKILL.md`, `.opencode/skills/designer/SKILL.md` |
