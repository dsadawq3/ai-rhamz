import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useConfig } from "../config"
import type { JSX } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { tint } from "../theme/color"
import { registerOpencodeSpinner } from "./register-spinner"
import { SPINNER_FRAMES } from "./spinner-frames"
import { ShimmerText } from "./shimmer-text"

export { SPINNER_FRAMES } from "./spinner-frames"

registerOpencodeSpinner()

const DEFAULT_SHIMMER_PEAK = RGBA.fromHex("#dce6f7")

export function Spinner(props: { children?: JSX.Element; color?: RGBA; shimmer?: RGBA }) {
  const theme = useTheme()
  const config = useConfig().data
  const color = () => props.color ?? theme.text.muted
  const autoShimmer = () => tint(color(), DEFAULT_SHIMMER_PEAK, 0.68)
  const [frame, setFrame] = createSignal(0)
  createEffect(() => {
    if (!(config.animations ?? true) || !props.shimmer) return
    const timer = setInterval(() => setFrame((value) => (value + 1) % SPINNER_FRAMES.length), 60)
    onCleanup(() => clearInterval(timer))
  })
  // A bare spinner beside a long sibling shrinks to a fractional width that rounds to 0, so the
  // glyph paints on top of the row gap. Only a labeled spinner may shrink (to wrap its text).
  return (
    <Show
      when={config.animations ?? true}
      fallback={<text fg={color()}>{props.children ? <>⋯ {props.children}</> : "⋯"}</text>}
    >
      <Show
        when={props.shimmer}
        fallback={
          <box flexDirection="row" gap={1} flexShrink={props.children ? 1 : 0}>
            <box flexShrink={0}>
              <spinner frames={SPINNER_FRAMES} interval={60} color={color()} />
            </box>
            <Show when={props.children}>
              <ShimmerText fg={color()} shimmer={autoShimmer()}>
                {props.children}
              </ShimmerText>
            </Show>
          </box>
        }
      >
        {(shimmer) => (
          <ShimmerText fg={color()} shimmer={shimmer()}>
            {SPINNER_FRAMES[frame()]} {props.children}
          </ShimmerText>
        )}
      </Show>
    </Show>
  )
}
