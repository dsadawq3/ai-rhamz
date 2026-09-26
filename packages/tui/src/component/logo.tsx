import { RGBA, TextAttributes } from "@opentui/core"
import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useConfig } from "../config"
import { useTheme } from "../context/theme"
import { tint } from "../theme/color"
import { go, logo } from "../logo"

// Deep, refined 24-bit RGB stops (less loud, darker luxury cyber palette):
// Stop 0: Deep Blood Ruby (#c4284e)
// Stop 1: Muted Royal Amethyst (#7836b0)
// Stop 2: Deep Steel Cyan (#1f8ea8)
const STOP_CRIMSON = RGBA.fromHex("#c4284e")
const STOP_VIOLET = RGBA.fromHex("#7836b0")
const STOP_CYAN = RGBA.fromHex("#1f8ea8")
const SPECULAR_GLOW = RGBA.fromHex("#dce6f7")

function sampleGradient(t: number): RGBA {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped <= 0.5) {
    return tint(STOP_CRIMSON, STOP_VIOLET, clamped * 2)
  }
  return tint(STOP_VIOLET, STOP_CYAN, (clamped - 0.5) * 2)
}

function columnColor(col: number, totalCols: number, sweepCol: number): RGBA {
  const t = totalCols > 1 ? col / (totalCols - 1) : 0
  const base = sampleGradient(t)
  const dist = col - sweepCol
  // Smooth Gaussian scanline highlight across ~3.5 columns
  const highlight = Math.exp(-(dist * dist) / 9.5) * 0.44
  if (highlight <= 0.01) return base
  return tint(base, SPECULAR_GLOW, highlight)
}

export function Logo() {
  const theme = useTheme()
  const config = useConfig().data
  const dimensions = useTerminalDimensions()

  const leftWidth = logo.left[1]?.length ?? 7
  const rightWidth = logo.right[1]?.length ?? 25
  const totalWidth = leftWidth + 1 + rightWidth
  // Sweep range includes a calm pause beyond the right edge before looping
  const cycleSpan = totalWidth + 28
  const [sweep, setSweep] = createSignal(-6)

  onMount(() => {
    if (config.animations === false) return
    const timer = setInterval(() => {
      setSweep((prev) => (prev >= cycleSpan ? -8 : prev + 0.85))
    }, 45)
    onCleanup(() => clearInterval(timer))
  })

  const renderGradientLine = (line: string, startCol: number, totalCols: number, bold: boolean): JSX.Element[] => {
    const attrs = bold ? TextAttributes.BOLD : undefined
    const currentSweep = sweep()
    return Array.from(line).map((char, idx) => {
      const fg = columnColor(startCol + idx, totalCols, currentSweep)
      const shadow = tint(theme.background.base, fg, 0.22)
      if (char === "_") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            {" "}
          </text>
        )
      }
      if (char === "^") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === "~") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === ",") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▄
          </text>
        )
      }
      return (
        <text fg={fg} attributes={attrs} selectable={false}>
          {char}
        </text>
      )
    })
  }

  return (
    <box alignItems="center">
      {dimensions().height < 12 ? null : dimensions().width < 22 ? (
        <For each={go.right.slice(1)}>
          {(line) => <box flexDirection="row">{renderGradientLine(line, 0, line.length, true)}</box>}
        </For>
      ) : dimensions().width < 38 ? (
        <>
          <For each={logo.left.slice(1)}>
            {(line) => <box flexDirection="row">{renderGradientLine(line, 0, line.length, true)}</box>}
          </For>
          <For each={logo.right}>
            {(line) => <box flexDirection="row">{renderGradientLine(line, 0, line.length, true)}</box>}
          </For>
        </>
      ) : (
        <>
          <For each={logo.left}>
            {(line, index) => (
              <box flexDirection="row" gap={1}>
                <box flexDirection="row">{renderGradientLine(line, 0, totalWidth, true)}</box>
                <box flexDirection="row">{renderGradientLine(logo.right[index()], leftWidth + 1, totalWidth, true)}</box>
              </box>
            )}
          </For>
        </>
      )}
    </box>
  )
}
