import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For } from "solid-js"
import { useConfig } from "../config"
import { useTheme, useThemes } from "../context/theme"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"

type Setting = {
  title: string
  category: string
  path: string[]
  default: unknown
  values?: readonly unknown[]
  labels?: readonly string[]
  step?: number
  min?: number
  max?: number
  format?: (value: unknown) => string
  keywords?: readonly string[]
}

export const settings: Setting[] = [
  {
    title: "Theme",
    category: "Appearance",
    path: ["theme", "name"],
    default: "opencode",
    keywords: ["color scheme", "colors"],
  },
  {
    title: "Color mode",
    category: "Appearance",
    path: ["theme", "mode"],
    default: "dark",
    values: ["system", "dark", "light"],
    keywords: ["dark mode", "light mode", "system theme"],
  },
  {
    title: "Animations",
    category: "Appearance",
    path: ["animations"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["motion", "effects"],
  },
  {
    title: "Sidebar",
    category: "Session",
    path: ["session", "sidebar"],
    default: "auto",
    values: ["hide", "auto"],
    keywords: ["side panel"],
  },
  {
    title: "Scrollbar",
    category: "Session",
    path: ["session", "scrollbar"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["scroll bar"],
  },
  {
    title: "Thinking",
    category: "Session",
    path: ["session", "thinking"],
    default: "show",
    values: ["hide", "show"],
    keywords: ["reasoning", "chain of thought"],
  },
  {
    title: "Markdown",
    category: "Session",
    path: ["session", "markdown"],
    default: "rendered",
    values: ["source", "rendered"],
    keywords: ["syntax", "concealment", "rendering"],
  },
  {
    title: "Tool grouping",
    category: "Session",
    path: ["session", "grouping"],
    default: "auto",
    values: ["none", "auto"],
    keywords: ["transcript", "messages", "reads", "searches"],
  },
  {
    title: "Transcript images",
    category: "Session",
    path: ["session", "image_preview"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["attachments", "images", "tool output"],
  },
  {
    title: "TPS",
    category: "Session",
    path: ["session", "tps"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["tokens per second", "throughput"],
  },
  {
    title: "New session location",
    category: "Session",
    path: ["session", "new_location"],
    default: "launch",
    values: ["launch", "inherit"],
    labels: ["launch directory", "active session"],
    keywords: ["directory", "cwd", "inherit"],
  },
  {
    title: "Permissions",
    category: "Session",
    path: ["session", "permissions"],
    default: "autoaccept",
    values: ["prompt", "autoaccept"],
    labels: ["prompt", "auto accept"],
    keywords: ["approve", "accept", "permission requests"],
  },
  {
    title: "Mode",
    category: "Tabs",
    path: ["tabs", "mode"],
    default: "auto",
    values: ["off", "on", "auto"],
  },
  {
    title: "Scope",
    category: "Tabs",
    path: ["tabs", "scope"],
    default: "cwd",
    values: ["cwd", "global"],
    labels: ["current directory", "global"],
  },
  {
    title: "Layout",
    category: "Tabs",
    path: ["tabs", "layout"],
    default: "horizontal",
    values: ["horizontal", "vertical"],
    keywords: ["sidebar", "orientation", "left"],
  },
  {
    title: "Indicators",
    category: "Tabs",
    path: ["tabs", "indicators"],
    default: "status",
    values: ["status", "numbers"],
    labels: ["status icons", "always show numbers"],
    keywords: ["tab numbers", "number mode", "status icons"],
  },
  {
    title: "Layout",
    category: "Diffs",
    path: ["diffs", "view"],
    default: "auto",
    values: ["auto", "split", "unified"],
    keywords: ["diff layout", "split diff", "unified diff"],
  },
  {
    title: "Wrapping",
    category: "Diffs",
    path: ["diffs", "wrap"],
    default: "word",
    values: ["none", "word"],
    keywords: ["diff wrap", "word wrap", "line wrap"],
  },
  {
    title: "File tree",
    category: "Diffs",
    path: ["diffs", "tree"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["diff files"],
  },
  {
    title: "Single patch",
    category: "Diffs",
    path: ["diffs", "single"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["one file", "selected file"],
  },
  {
    title: "Scroll speed",
    category: "Input",
    path: ["scroll", "speed"],
    default: 5,
    step: 0.25,
    min: 0.25,
    max: 10,
    format: (value) => Number(value).toFixed(2),
    keywords: ["scrolling"],
  },
  {
    title: "Acceleration",
    category: "Input",
    path: ["scroll", "acceleration"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["scroll acceleration"],
  },
  {
    title: "Mouse",
    category: "Input",
    path: ["mouse"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["mouse capture"],
  },
  {
    title: "Editor context",
    category: "Input",
    path: ["prompt", "editor"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["file context", "prompt context", "editor selection"],
  },
  {
    title: "Large pastes",
    category: "Input",
    path: ["prompt", "paste"],
    default: "compact",
    values: ["compact", "full"],
    keywords: ["paste summary", "clipboard", "pasted content"],
  },
  {
    title: "Image previews",
    category: "Input",
    path: ["prompt", "image_preview"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["attachments", "clipboard", "images", "prompt"],
  },
  {
    title: "Leader timeout",
    category: "Input",
    path: ["leader", "timeout"],
    default: 2000,
    step: 250,
    min: 250,
    max: 10000,
    format: (value) => `${value} ms`,
    keywords: ["leader key", "shortcut timeout"],
  },
  {
    title: "Notifications",
    category: "Alerts",
    path: ["attention", "notifications"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["system notifications", "desktop notifications", "alerts"],
  },
  {
    title: "Sounds",
    category: "Alerts",
    path: ["attention", "sound"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["audio", "sound effects", "alerts"],
  },
  {
    title: "Volume",
    category: "Alerts",
    path: ["attention", "volume"],
    default: 0.4,
    step: 0.1,
    min: 0,
    max: 1,
    format: (value) => `${Math.round(Number(value) * 100)}%`,
    keywords: ["sound volume", "audio volume"],
  },
  {
    title: "Window title",
    category: "Terminal",
    path: ["terminal", "title"],
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["terminal title", "tab title"],
  },
  {
    title: "Copy behavior",
    category: "Terminal",
    path: ["terminal", "copy"],
    default: process.platform === "win32" ? "manual" : "select",
    values: ["manual", "select"],
    keywords: ["selection", "clipboard"],
  },
  {
    title: "Developer tools",
    category: "Debug",
    path: ["debug", "devtools"],
    default: false,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["debug bar", "developer tools"],
  },
]

const CATEGORIES = ["All", ...Array.from(new Set(settings.map((s) => s.category)))]

export function settingID(setting: Setting) {
  return setting.path.join(".")
}

export function DialogConfig(props: { current?: string }) {
  const config = useConfig()
  const toast = useToast()
  const themes = useThemes()
  const theme = useTheme().surface("dialog")
  const current = Math.max(
    0,
    settings.findIndex((setting) => settingID(setting) === props.current),
  )
  const [selected, setSelected] = createSignal(current)
  const [activeCategory, setActiveCategory] = createSignal<string>("All")
  const [saving, setSaving] = createSignal(false)

  const value = (setting: Setting) => {
    const current = setting.path.reduce<unknown>((result, key) => {
      if (!result || typeof result !== "object") return undefined
      return (result as Record<string, unknown>)[key]
    }, config.data)
    if (setting.path.join(".") === "theme.name") return current ?? themes.selected
    return current ?? setting.default
  }
  const values = (setting: Setting) =>
    setting.path.join(".") === "theme.name"
      ? Object.keys(themes.all()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      : setting.values
  const display = (setting: Setting) => {
    const current = value(setting)
    if (setting.format) return `◂ ${setting.format(current)} ▸`
    const index = setting.values?.indexOf(current)
    const label = index === undefined || index < 0 ? String(current) : (setting.labels?.[index] ?? String(current))
    return `◂ ${label} ▸`
  }
  const options = createMemo(() => {
    const cat = activeCategory()
    return settings
      .map((setting, index) => ({
        title: setting.title,
        category: cat === "All" ? setting.category : undefined,
        searchText: setting.keywords?.join(" "),
        footer: display(setting),
        value: index,
      }))
      .filter((_, index) => cat === "All" || settings[index]?.category === cat)
  })

  function cycleCategory(delta: 1 | -1) {
    const idx = CATEGORIES.indexOf(activeCategory())
    const next = CATEGORIES[(idx + delta + CATEGORIES.length) % CATEGORIES.length]
    setActiveCategory(next)
  }

  async function change(direction: number, index = selected()) {
    if (saving()) return
    const setting = settings[index]
    if (!setting) return
    const current = value(setting)
    const choices = values(setting)
    const next = choices
      ? choices[(choices.indexOf(current) + direction + choices.length) % choices.length]
      : Math.min(setting.max!, Math.max(setting.min!, Number(current) + direction * setting.step!))
    if (next === current) return
    setSaving(true)
    await config
      .update((draft) => {
        const parent = setting.path.slice(0, -1).reduce<Record<string, unknown>>((result, key) => {
          if (!result[key] || typeof result[key] !== "object") result[key] = {}
          return result[key] as Record<string, unknown>
        }, draft)
        parent[setting.path.at(-1)!] = next
      })
      .catch(toast.error)
      .finally(() => setSaving(false))
  }

  return (
    <DialogSelect
      title="Settings"
      titleView={
        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
            Settings
          </text>
          <box flexDirection="row" gap={1} flexWrap="wrap">
            <For each={CATEGORIES}>
              {(cat) => {
                const isCurrent = () => activeCategory() === cat
                return (
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={isCurrent() ? theme.background.raised.max : theme.background.raised.high}
                    onMouseUp={() => setActiveCategory(cat)}
                  >
                    <text
                      fg={isCurrent() ? theme.text.base : theme.text.muted}
                      attributes={isCurrent() ? TextAttributes.BOLD : undefined}
                      wrapMode="none"
                    >
                      {cat}
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </box>
      }
      options={options()}
      current={current}
      filterThreshold={0.7}
      onMove={(option) => setSelected(option.value)}
      onSelect={(option) => void change(1, option.value)}
      footerHints={[
        { title: "←/→", label: "change" },
        { title: "tab", label: "category" },
      ]}
      bindings={[
        {
          bind: "left",
          title: "Previous value",
          group: "Settings",
          run: () => void change(-1),
        },
        {
          bind: "right",
          title: "Next value",
          group: "Settings",
          run: () => void change(1),
        },
        {
          bind: "tab",
          title: "Next category tab",
          group: "Settings",
          run: () => cycleCategory(1),
        },
        {
          bind: "shift+tab",
          title: "Previous category tab",
          group: "Settings",
          run: () => cycleCategory(-1),
        },
      ]}
    />
  )
}
