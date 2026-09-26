import { createMemo, For, Show, createEffect, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { TextAttributes, ScrollBoxRenderable } from "@opentui/core"
import type { SessionInfo } from "@opencode/client"
import { useRoute, useRouteData } from "../../../context/route"
import { useData } from "../../../context/data"
import { useClient } from "../../../context/client"
import { useTheme } from "../../../context/theme"
import { Locale } from "../../../util/locale"
import { Keymap } from "../../../context/keymap"
import { useComposerTab } from "./context"
import { withTimestampedFallback } from "@opencode/util/session-title-fallback"
import { sessionFamily } from "../../../util/session"

interface SubagentEntry {
  sessionID: string
  agent: string
  title: string
  status: string
  current: boolean
  prefix: string
}

export function SubagentsTab(props: { sessionID: string }) {
  const route = useRouteData("session")
  const data = useData()
  const client = useClient()
  const theme = useTheme()
  const navigate = useRoute().navigate
  const composer = useComposerTab()
  const shortcuts = Keymap.useShortcuts()

  const session = createMemo(() => data.session.get(props.sessionID))
  const [store, setStore] = createStore({ selected: 0, onlyRunning: false })

  const rootSession = createMemo(() => {
    let curr = session()
    while (curr?.parentID) {
      const parent = data.session.get(curr.parentID)
      if (!parent) break
      curr = parent
    }
    return curr
  })

  const entries = createMemo<SubagentEntry[]>(() => {
    const root = rootSession()
    if (!root) return []

    const rootEntry: SubagentEntry = {
      sessionID: root.id,
      agent: root.agent ? `${Locale.titlecase(root.agent)} (Root)` : "Root Session",
      title: withTimestampedFallback(root),
      status: data.session.status(root.id),
      current: root.id === route.sessionID,
      prefix: "◈ ",
    }

    const children = sessionFamily<SessionInfo>(data.session.list(), root.id).map(
      ({ session: child, prefix }): SubagentEntry => {
        const title = withTimestampedFallback(child)
        const agentMatch = title.match(/@(\w+) subagent/)
        return {
          sessionID: child.id,
          agent: child.agent
            ? Locale.titlecase(child.agent)
            : agentMatch
              ? Locale.titlecase(agentMatch[1])
              : "Subagent",
          title: agentMatch ? title.replace(agentMatch[0], "").trim() || title : title,
          status: data.session.status(child.id),
          current: child.id === route.sessionID,
          prefix: `  ${prefix}`,
        }
      },
    )

    const filteredChildren = store.onlyRunning
      ? children.filter((entry) => entry.status === "running")
      : children

    return children.length > 0 ? [rootEntry, ...filteredChildren] : []
  })

  let selectedSessionID = ""
  let wasActive = false
  let scroll: ScrollBoxRenderable | undefined

  const selectedEntry = createMemo(() => entries()[store.selected])

  createEffect(() => {
    const active = composer.active("subagents")
    if (!active) {
      if (wasActive) {
        selectedSessionID = ""
        setStore({ selected: 0, onlyRunning: false })
      }
      wasActive = false
      return
    }
    const list = entries()
    if (selectedSessionID !== route.sessionID && list.length > 0) {
      const currentIdx = list.findIndex((e) => e.current)
      const next = currentIdx >= 0 ? currentIdx : 0
      selectedSessionID = route.sessionID
      setStore("selected", next)
      const scrollCurrentIntoView = () => scrollToIndex(next, true)
      scrollCurrentIntoView()
      // The remounted scrollbox finishes layout on the next frame and resets its scroll position.
      requestAnimationFrame(() => requestAnimationFrame(scrollCurrentIntoView))
    }
    wasActive = true
    if (store.selected >= list.length) moveTo(Math.max(0, list.length - 1))
  })

  function moveTo(next: number, center = false) {
    setStore("selected", next)
    scrollToIndex(next, center)
  }

  function scrollToIndex(index: number, center: boolean) {
    if (!scroll) return
    if (center) {
      scroll.scrollTo(Math.max(0, index - Math.floor(scroll.viewport.height / 2)))
      return
    }
    if (index >= scroll.scrollTop + scroll.viewport.height) {
      scroll.scrollTo(index - scroll.viewport.height + 1)
    }
    if (index < scroll.scrollTop) {
      scroll.scrollTo(index)
      if (index === 0) scroll.scrollTo(0)
    }
  }

  onMount(() => {
    const cleanup = composer.register({
      id: "subagents",
      label: "Swarm Tree",
      hints: () => {
        const entry = selectedEntry()
        return [
          { label: "open", shortcut: "enter/click" },
          ...(entry?.status === "running"
            ? [{ label: "interrupt", shortcut: shortcuts.get("composer.subagent.interrupt") ?? "" }]
            : []),
          {
            label: store.onlyRunning ? "show all" : "running only",
            shortcut: shortcuts.get("composer.subagent.toggle-activity") ?? "ctrl+a",
          },
        ]
      },
    })
    onCleanup(cleanup)
  })

  Keymap.createLayer(() => ({
    mode: "composer",
    enabled: () => composer.active("subagents"),
    priority: 1,
    commands: [
      {
        id: "composer.subagent.up",
        title: "Previous subagent",
        group: "Composer",
        run() {
          if (store.selected === 0) {
            composer.close()
            return
          }
          moveTo(store.selected - 1, true)
        },
      },
      {
        id: "composer.subagent.down",
        title: "Next subagent",
        group: "Composer",
        run() {
          const list = entries()
          if (list.length === 0) return
          moveTo((store.selected + 1) % list.length, true)
        },
      },
      {
        id: "composer.subagent.select",
        title: "Navigate to subagent",
        group: "Composer",
        run() {
          const entry = entries()[store.selected]
          if (entry) {
            navigate({ type: "session", sessionID: entry.sessionID })
            composer.close()
          }
        },
      },
      {
        id: "composer.subagent.toggle-activity",
        title: "Toggle active subagents",
        group: "Composer",
        bind: "ctrl+a",
        run() {
          setStore({ selected: 0, onlyRunning: !store.onlyRunning })
          scroll?.scrollTo(0)
        },
      },
      {
        id: "composer.subagent.interrupt",
        title: "Interrupt subagent",
        group: "Composer",
        run() {
          const entry = selectedEntry()
          if (!entry || entry.status !== "running") return
          void client.api.session.interrupt({ sessionID: entry.sessionID })
        },
      },
    ],
  }))

  return (
    <Show when={composer.active("subagents")}>
      <scrollbox scrollbarOptions={{ visible: entries().length > 8 }} maxHeight={8} ref={(r: ScrollBoxRenderable) => (scroll = r)}>
        <Show
          when={entries().length > 0}
          fallback={<text fg={theme.text.muted}> No subagents spawned in this session yet</text>}
        >
          <For each={entries()}>
            {(entry, index) => {
              const active = createMemo(() => index() === store.selected)
              const statusLabel = createMemo(() => {
                if (entry.status === "running") return "● Running"
                if (entry.current) return "◉ Current"
                return "✓ Done"
              })
              return (
                <box
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={
                    active()
                      ? theme.background.action.primary.focused
                      : entry.current
                        ? theme.background.action.primary.selected
                        : theme.background.action.primary.base
                  }
                  onMouseMove={() => setStore("selected", index())}
                  onMouseUp={() => {
                    setStore("selected", index())
                    navigate({ type: "session", sessionID: entry.sessionID })
                    composer.close()
                  }}
                >
                  <box flexGrow={1} minWidth={0} flexDirection="row">
                    <text
                      fg={
                        active()
                          ? theme.text.action.primary.focused
                          : entry.current
                            ? theme.text.action.primary.selected
                            : theme.text.action.primary.base
                      }
                      attributes={active() || entry.current ? TextAttributes.BOLD : undefined}
                      wrapMode="none"
                    >
                      {entry.prefix}
                      {entry.agent}: {entry.title}
                    </text>
                  </box>
                  <text
                    fg={
                      entry.status === "running"
                        ? theme.text.feedback.info.base
                        : active()
                          ? theme.text.action.primary.focused
                          : theme.text.muted
                    }
                    wrapMode="none"
                  >
                    {statusLabel()}
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>
    </Show>
  )
}

