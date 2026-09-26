import { createMemo, For, Show, createEffect, createSignal, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import fs from "fs"
import path from "path"
import { useData } from "../../../context/data"
import { useLocal } from "../../../context/local"
import { useTheme } from "../../../context/theme"
import { Keymap } from "../../../context/keymap"
import { useComposerTab } from "./context"
import { useDialog } from "../../../ui/dialog"
import { useToast } from "../../../ui/toast"
import { useConfig } from "../../../config"

const DEFAULT_CONTEXT_TEMPLATE = [
  "<!-- AI RHAMZ Persistent Session Context (.opencode/context/context.md) -->",
  "<!-- Write persistent targets, scope rules, credentials, offsets, or custom instructions below. -->",
  "<!-- Everything here is automatically injected into compactions and live checkpoints. -->",
  "",
].join("\n")

function resolveContextPaths(workspaceDir: string, sessionID: string) {
  const dir = path.join(workspaceDir, ".opencode", "context")
  const safeId = sessionID.replace(/[^a-zA-Z0-9_-]/g, "_")
  return {
    dir,
    contextFile: path.join(dir, "context.md"),
    compactionFile: path.join(dir, `compaction-${safeId}.md`),
    latestFile: path.join(dir, "latest-compaction.md"),
  }
}

function DialogMultilineFileEditor(props: {
  title: string
  subtitle: string
  filePath: string
  initialValue: string
  onSave: (content: string) => void
}) {
  const dialog = useDialog()
  const renderer = useRenderer()
  const theme = useTheme().surface("dialog")
  const config = useConfig().data
  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  let textarea: TextareaRenderable

  function save() {
    if (!textarea || textarea.isDestroyed) return
    props.onSave(textarea.plainText)
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    target: textareaTarget,
    enabled: textareaTarget() !== undefined,
    priority: 2,
    commands: [
      {
        bind: "ctrl+s",
        title: "Save context file",
        group: "Dialog",
        run: save,
      },
      {
        bind: "escape",
        title: "Close editor",
        group: "Dialog",
        run: () => {
          if (renderer.getSelection()) {
            renderer.clearSelection()
            return
          }
          dialog.clear()
        },
      },
    ],
  }))

  onMount(() => {
    dialog.setSize("large")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      textarea.focus()
    }, 1)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text.base}>
          {props.title}
        </text>
        <text fg={theme.text.muted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.text.muted}>{props.subtitle}</text>
      <box
        border={["left", "right", "top", "bottom"]}
        borderColor={theme.border.base}
        paddingLeft={1}
        paddingRight={1}
      >
        <textarea
          height={12}
          wrapMode="word"
          ref={(val: TextareaRenderable) => {
            textarea = val
            setTextareaTarget(val)
          }}
          initialValue={props.initialValue}
          placeholder="Write custom context notes, targets, payloads, offsets, or compaction summary..."
          placeholderColor={theme.text.muted}
          textColor={theme.text.formfield.base}
          focusedTextColor={theme.text.formfield.base}
          cursorColor={theme.text.base}
          cursorStyle={config.cursor}
        />
      </box>
      <box paddingBottom={1} gap={2} flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={2}>
          <box onMouseUp={save}>
            <text fg={theme.text.base}>
              <b>ctrl+s</b> <span style={{ fg: theme.text.muted }}>save to disk</span>
            </text>
          </box>
          <box onMouseUp={() => dialog.clear()}>
            <text fg={theme.text.base}>
              <b>esc</b> <span style={{ fg: theme.text.muted }}>cancel</span>
            </text>
          </box>
        </box>
        <text fg={theme.text.muted} wrapMode="none">
          {props.filePath}
        </text>
      </box>
    </box>
  )
}

export function ContextTab(props: { sessionID: string }) {
  const data = useData()
  const local = useLocal()
  const theme = useTheme()
  const composer = useComposerTab()
  const dialog = useDialog()
  const toast = useToast()

  const session = createMemo(() => data.session.get(props.sessionID))
  const workspaceDir = createMemo(() => session()?.location?.directory || process.cwd())
  const messages = createMemo(() => data.session.message.list(props.sessionID))

  const latestCompactionMsg = createMemo(() => {
    const list = messages()
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (m?.type === "compaction" && m.status === "completed") return m
    }
    return undefined
  })

  const compactionCount = createMemo(
    () => messages().filter((m) => m.type === "compaction" && m.status === "completed").length,
  )

  const [store, setStore] = createStore({
    selected: 0,
    refreshTick: 0,
  })

  const fileStatus = createMemo(() => {
    void store.refreshTick
    const paths = resolveContextPaths(workspaceDir(), props.sessionID)
    let hasCustomNotes = false
    let hasCompactionFile = false
    try {
      if (fs.existsSync(paths.contextFile)) {
        const raw = fs.readFileSync(paths.contextFile, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim()
        hasCustomNotes = raw.length > 0
      }
      hasCompactionFile = fs.existsSync(paths.compactionFile)
    } catch {
      // ignore
    }
    return { ...paths, hasCustomNotes, hasCompactionFile }
  })

  const runCompactNow = () => {
    const selection = local.model.current()
    toast.show({
      message: "Compacting session (Hybrid LLM + V2 WorkingState → .opencode/context/)…",
      variant: "info",
      duration: 3500,
    })
    void data.session
      .compact({
        sessionID: props.sessionID,
        model: selection
          ? {
              providerID: selection.providerID,
              id: selection.modelID,
              variant: local.model.variant.current(),
            }
          : undefined,
      })
      .then(() => {
        setStore("refreshTick", (t) => t + 1)
      })
      .catch((err) => {
        toast.show({
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
        })
      })
    composer.close()
  }

  const openCustomContextEditor = () => {
    const info = fileStatus()
    let current = DEFAULT_CONTEXT_TEMPLATE
    try {
      fs.mkdirSync(info.dir, { recursive: true })
      if (fs.existsSync(info.contextFile)) {
        current = fs.readFileSync(info.contextFile, "utf8")
      } else {
        fs.writeFileSync(info.contextFile, DEFAULT_CONTEXT_TEMPLATE, "utf8")
      }
    } catch {
      // ignore
    }
    dialog.replace(() => (
      <DialogMultilineFileEditor
        title="Persistent Session Context (.opencode/context/context.md)"
        subtitle="Write custom notes, targets, payloads, offsets, or instructions. Automatically preserved across all compactions."
        filePath=".opencode/context/context.md"
        initialValue={current}
        onSave={(nextContent) => {
          try {
            fs.mkdirSync(info.dir, { recursive: true })
            fs.writeFileSync(info.contextFile, nextContent, "utf8")
            setStore("refreshTick", (t) => t + 1)
            toast.show({
              message: "Saved .opencode/context/context.md (active for compactions & live checkpoints)",
              variant: "success",
              duration: 3500,
            })
            dialog.clear()
          } catch (err) {
            toast.show({
              message: `Failed to save context.md: ${err instanceof Error ? err.message : String(err)}`,
              variant: "error",
            })
          }
        }}
      />
    ))
  }

  const openCompactionCheckpointEditor = () => {
    const info = fileStatus()
    const compMsg = latestCompactionMsg()
    let current = ""
    try {
      fs.mkdirSync(info.dir, { recursive: true })
      if (fs.existsSync(info.compactionFile)) {
        current = fs.readFileSync(info.compactionFile, "utf8")
      } else if (compMsg?.summary) {
        current = compMsg.summary
      } else {
        current = [
          `<!-- AI RHAMZ Editable Compaction Checkpoint (Session: ${props.sessionID}) -->`,
          "## Objective",
          "- ",
          "",
          "## Important Context",
          "- ",
          "",
          "## Technical & Offensive / Swarm State",
          "- ",
          "",
        ].join("\n")
      }
    } catch {
      current = compMsg?.summary ?? ""
    }
    const relPath = `.opencode/context/${path.basename(info.compactionFile)}`
    dialog.replace(() => (
      <DialogMultilineFileEditor
        title="Editable Compaction Checkpoint"
        subtitle="Edit the session compaction summary directly. Changes are live-loaded into <conversation-checkpoint>."
        filePath={relPath}
        initialValue={current}
        onSave={(nextContent) => {
          try {
            fs.mkdirSync(info.dir, { recursive: true })
            fs.writeFileSync(info.compactionFile, nextContent, "utf8")
            fs.writeFileSync(info.latestFile, nextContent, "utf8")
            setStore("refreshTick", (t) => t + 1)
            toast.show({
              message: `Saved ${relPath} — live checkpoint updated`,
              variant: "success",
              duration: 3500,
            })
            dialog.clear()
          } catch (err) {
            toast.show({
              message: `Failed to save checkpoint: ${err instanceof Error ? err.message : String(err)}`,
              variant: "error",
            })
          }
        }}
      />
    ))
  }

  const items = createMemo(() => {
    const status = fileStatus()
    const count = compactionCount()
    return [
      {
        id: "compact",
        label: "⚡ Compact Session Now",
        detail:
          count > 0
            ? `Run hybrid compaction (${count} completed in session · writes editable .opencode/context/ file)`
            : "Summarize & compress history (BugBounty/Swarm-aware + auto WorkingState V2 digest)",
        run: runCompactNow,
      },
      {
        id: "context-notes",
        label: "✎ Edit Persistent Context (.opencode/context/context.md)",
        detail: status.hasCustomNotes
          ? "● Active operator notes present — pinned across all compactions"
          : "○ Add persistent targets, scope, payloads, offsets, or instructions",
        run: openCustomContextEditor,
      },
      {
        id: "checkpoint-file",
        label: `◈ Edit Compaction Checkpoint (.opencode/context/${path.basename(status.compactionFile)})`,
        detail: status.hasCompactionFile
          ? "● Checkpoint file ready on disk — edits hot-reload into <conversation-checkpoint>"
          : count > 0
            ? "● Checkpoint in memory — click to save & edit on disk"
            : "○ Pre-seed or inspect session compaction checkpoint file",
        run: openCompactionCheckpointEditor,
      },
    ]
  })

  createEffect(() => {
    if (composer.active("context")) {
      setStore("refreshTick", (t) => t + 1)
    }
  })

  onMount(() => {
    const cleanup = composer.register({
      id: "context",
      label: "Context & Compact",
      hints: () => [
        { label: "select", shortcut: "enter/click" },
        { label: "compact now", shortcut: "c" },
        { label: "edit notes", shortcut: "e" },
      ],
    })
    onCleanup(cleanup)
  })

  Keymap.createLayer(() => ({
    mode: "composer",
    enabled: () => composer.active("context"),
    priority: 1,
    commands: [
      {
        bind: "up",
        title: "Previous context action",
        group: "Composer",
        run() {
          if (store.selected === 0) {
            composer.close()
            return
          }
          setStore("selected", (prev) => Math.max(0, prev - 1))
        },
      },
      {
        bind: "down",
        title: "Next context action",
        group: "Composer",
        run() {
          setStore("selected", (prev) => (prev + 1) % items().length)
        },
      },
      {
        bind: "return",
        title: "Run selected context action",
        group: "Composer",
        run() {
          items()[store.selected]?.run()
        },
      },
      {
        bind: "c",
        title: "Compact session now",
        group: "Composer",
        run: runCompactNow,
      },
      {
        bind: "e",
        title: "Edit persistent context notes",
        group: "Composer",
        run: openCustomContextEditor,
      },
    ],
  }))

  return (
    <Show when={composer.active("context")}>
      <box gap={0}>
        <For each={items()}>
          {(item, index) => {
            const active = createMemo(() => index() === store.selected)
            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={
                  active() ? theme.background.action.primary.focused : theme.background.action.primary.base
                }
                onMouseMove={() => setStore("selected", index())}
                onMouseUp={() => {
                  setStore("selected", index())
                  item.run()
                }}
              >
                <text
                  fg={active() ? theme.text.action.primary.focused : theme.text.action.primary.base}
                  attributes={active() ? TextAttributes.BOLD : undefined}
                  wrapMode="none"
                >
                  {item.label}
                </text>
                <text fg={theme.text.muted} wrapMode="none">
                  {item.detail}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
