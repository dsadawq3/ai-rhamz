import {
  OptimizedBuffer,
   parseColor,
  RGBA,
  TargetChannel,
  TextareaRenderable,
  type ColorInput,
  type RenderContext,
  type TextareaOptions,
} from "@opentui/core"
import { extend } from "@opentui/solid"
import { coast, smootherstep } from "../tab-pulse"

const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0)
const CONTINUATION = 0xc0000000 | 0
const KEYSTROKE_FADE_MS = 55
const KEYSTROKE_BLOOM_MS = 240
const PLACEHOLDER_REVEAL_MS = 280
const PLACEHOLDER_FEATHER = 12
const WAKE_TAIL_CELLS = 6
const MAX_RIPPLES = 32

const clamp = (value: number) => Math.max(0, Math.min(1, value))

type KeystrokeRipple = {
  row: number
  startCol: number
  endCol: number
  age: number
  deleting: boolean
}

export type KineticTextareaOptions = TextareaOptions & {
  kinetic?: boolean
  bloomColor?: ColorInput
  wakeColor?: ColorInput
  backdropColor?: ColorInput
}

export class KineticTextareaRenderable extends TextareaRenderable {
  private _kinetic: boolean
  private _bloomColor: RGBA
  private _wakeColor: RGBA
  private _backdropColor: RGBA
  private baseCursorColor: RGBA
  private animatedCursorColor = RGBA.fromHex("#e2e5f0")
  private lastText = ""
  private ripples: KeystrokeRipple[] = []
  private typingEnergy = 0
  private placeholderReveal = 0
  private fresh = true
  private scratch: OptimizedBuffer | undefined
  private bloomMask = new Float32Array(0)
  private fadeMask = new Float32Array(0)
  private bloomMatrix = new Float32Array(16)
  private fadeMatrix = new Float32Array(16)

  constructor(ctx: RenderContext, options: KineticTextareaOptions) {
    super(ctx, options)
    this._kinetic = options.kinetic ?? true
    this._bloomColor = options.bloomColor ? parseColor(options.bloomColor) : RGBA.fromHex("#38b6d4")
    this._wakeColor = options.wakeColor ? parseColor(options.wakeColor) : RGBA.fromHex("#8e44d8")
    this._backdropColor = options.backdropColor ? parseColor(options.backdropColor) : RGBA.fromHex("#0b0d14")
    this.baseCursorColor = RGBA.clone(this._cursorColor)
    this.bloomMatrix[15] = 1
    this.fadeMatrix[15] = 1
    this.updateMatrices()
    this.lastText = this.plainText
    this.placeholderReveal = this.lastText.length === 0 ? 0 : PLACEHOLDER_REVEAL_MS

    this.editBuffer.on("content-changed", () => {
      if (this.isDestroyed) return
      const nextText = this.plainText
      const prevLen = this.lastText.length
      const nextLen = nextText.length
      this.lastText = nextText

      if (!this._kinetic) return

      if (nextLen === 0 && prevLen > 0) {
        this.ripples.length = 0
        this.placeholderReveal = 0
        this.typingEnergy = Math.min(1, this.typingEnergy + 0.3)
        this.wake()
        return
      }

      const vc = this.editorView.getVisualCursor()
      if (nextLen > prevLen) {
        const deltaCols = Math.min(24, Math.max(1, nextLen - prevLen))
        const endCol = Math.max(0, vc.visualCol - 1)
        const startCol = Math.max(0, endCol - deltaCols + 1)
        if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift()
        this.ripples.push({
          row: vc.visualRow,
          startCol,
          endCol,
          age: 0,
          deleting: false,
        })
        this.typingEnergy = Math.min(1, this.typingEnergy + 0.38)
        this.wake()
      } else if (nextLen < prevLen) {
        const col = Math.max(0, vc.visualCol)
        if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift()
        this.ripples.push({
          row: vc.visualRow,
          startCol: Math.max(0, col - 1),
          endCol: col + 1,
          age: 0,
          deleting: true,
        })
        this.typingEnergy = Math.min(1, this.typingEnergy + 0.24)
        this.wake()
      }
    })

    this.live = this.animating
  }

  private get animating() {
    return (
      this._kinetic &&
      (this.ripples.length > 0 ||
        this.typingEnergy > 0.015 ||
        (this.lastText.length === 0 && this.placeholderReveal < PLACEHOLDER_REVEAL_MS))
    )
  }

  private wake() {
    if (!this.live && this.animating) this.fresh = true
    this.live = this.animating
    this.requestRender()
  }

  private updateMatrices() {
    const energy = clamp(this.typingEnergy)
    this.bloomMatrix[3] = this._wakeColor.r + (this._bloomColor.r - this._wakeColor.r) * energy
    this.bloomMatrix[7] = this._wakeColor.g + (this._bloomColor.g - this._wakeColor.g) * energy
    this.bloomMatrix[11] = this._wakeColor.b + (this._bloomColor.b - this._wakeColor.b) * energy

    this.fadeMatrix[3] = this._backdropColor.r
    this.fadeMatrix[7] = this._backdropColor.g
    this.fadeMatrix[11] = this._backdropColor.b
  }

  set kinetic(value: boolean) {
    if (value === this._kinetic) return
    this._kinetic = value
    if (!value) {
      this.ripples.length = 0
      this.typingEnergy = 0
      this.placeholderReveal = PLACEHOLDER_REVEAL_MS
      this._cursorColor = this.baseCursorColor
    }
    this.wake()
  }

  set bloomColor(value: ColorInput | undefined) {
    if (!value) return
    const parsed = parseColor(value)
    if (parsed.equals(this._bloomColor)) return
    this._bloomColor = parsed
    this.updateMatrices()
    this.requestRender()
  }

  set wakeColor(value: ColorInput | undefined) {
    if (!value) return
    const parsed = parseColor(value)
    if (parsed.equals(this._wakeColor)) return
    this._wakeColor = parsed
    this.updateMatrices()
    this.requestRender()
  }

  set backdropColor(value: ColorInput | undefined) {
    if (!value) return
    const parsed = parseColor(value)
    if (parsed.equals(this._backdropColor)) return
    this._backdropColor = parsed
    this.updateMatrices()
    this.requestRender()
  }

  override set cursorColor(value: RGBA | string) {
    super.cursorColor = value
    this.baseCursorColor = RGBA.clone(this._cursorColor)
  }

  override get cursorColor(): RGBA {
    return super.cursorColor
  }

  override set placeholder(value: TextareaOptions["placeholder"] | undefined) {
    const changed = value !== super.placeholder
    super.placeholder = value
    if (changed && this._kinetic && this.plainText.length === 0) {
      this.placeholderReveal = 0
      this.wake()
    }
  }

  override get placeholder() {
    return super.placeholder
  }

  override render(buffer: OptimizedBuffer, deltaTime: number) {
    if (!this.visible || this.isDestroyed) return
    if (
      !this.animating ||
      !Number.isFinite(this.width) ||
      !Number.isFinite(this.height) ||
      this.width <= 0 ||
      this.height <= 0
    ) {
      this.live = false
      this._cursorColor = this.baseCursorColor
      super.render(buffer, deltaTime)
      return
    }

    const delta = this.fresh ? 0 : Math.min(50, Math.max(0, deltaTime))
    this.fresh = false

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!
      ripple.age += delta
      if (ripple.age >= KEYSTROKE_BLOOM_MS) {
        this.ripples.splice(i, 1)
      }
    }

    if (this.typingEnergy > 0) {
      this.typingEnergy *= Math.exp(-delta / 180)
      if (this.typingEnergy < 0.015) this.typingEnergy = 0
    }

    if (this.lastText.length === 0 && this.placeholderReveal < PLACEHOLDER_REVEAL_MS) {
      this.placeholderReveal = Math.min(PLACEHOLDER_REVEAL_MS, this.placeholderReveal + delta)
    }

    this.live = this.animating
    if (!this.animating) {
      this._cursorColor = this.baseCursorColor
      super.render(buffer, deltaTime)
      return
    }

    if (this.typingEnergy > 0) {
      const cursorBlend = clamp(this.typingEnergy * 0.72)
      this.animatedCursorColor.r = this.baseCursorColor.r + (this._bloomColor.r - this.baseCursorColor.r) * cursorBlend
      this.animatedCursorColor.g = this.baseCursorColor.g + (this._bloomColor.g - this.baseCursorColor.g) * cursorBlend
      this.animatedCursorColor.b = this.baseCursorColor.b + (this._bloomColor.b - this.baseCursorColor.b) * cursorBlend
      this.animatedCursorColor.a = this.baseCursorColor.a
      this._cursorColor = this.animatedCursorColor
    } else {
      this._cursorColor = this.baseCursorColor
    }

    this.updateMatrices()

    if (!this.scratch) {
      this.scratch = OptimizedBuffer.create(this.width, this.height, this._ctx.widthMethod, { respectAlpha: true })
    }
    if (this.scratch.width !== this.width || this.scratch.height !== this.height) {
      this.scratch.resize(this.width, this.height)
    }

    this.scratch.clear(TRANSPARENT)
    this.scratch.drawEditorView(this.editorView, 0, 0)

    const characters = this.scratch.buffers.char
    const cellCount = this.width * this.height
    if (this.bloomMask.length !== cellCount * 3) {
      this.bloomMask = new Float32Array(cellCount * 3)
      this.fadeMask = new Float32Array(cellCount * 3)
    }

    if (this.lastText.length === 0 && this.placeholderReveal < PLACEHOLDER_REVEAL_MS) {
      let end = 0
      for (let row = 0; row < this.height; row++) {
        let column = this.width
        while (
          column > 0 &&
          (characters[row * this.width + column - 1] === 32 || characters[row * this.width + column - 1] === 0)
        ) {
          column--
        }
        end = Math.max(end, column)
      }
      const progress = this.placeholderReveal / PLACEHOLDER_REVEAL_MS
      const front = -PLACEHOLDER_FEATHER + coast(progress) * (end + PLACEHOLDER_FEATHER * 2)
      let fadeStrength = 1
      let bloomStrength = 0
      for (let cell = 0; cell < cellCount; cell++) {
        const column = cell % this.width
        const row = Math.floor(cell / this.width)
        if ((characters[cell]! & CONTINUATION) !== CONTINUATION) {
          const dist = (front - column) / PLACEHOLDER_FEATHER
          const revealed = smootherstep(clamp(dist))
          fadeStrength = 1 - revealed
          // Subtle leading-edge glint as the placeholder sweeps across
          bloomStrength = dist > 0 && dist < 1 ? Math.sin(dist * Math.PI) * 0.45 : 0
        }
        this.bloomMask[cell * 3] = column
        this.bloomMask[cell * 3 + 1] = row
        this.bloomMask[cell * 3 + 2] = bloomStrength
        this.fadeMask[cell * 3] = column
        this.fadeMask[cell * 3 + 1] = row
        this.fadeMask[cell * 3 + 2] = fadeStrength
      }
      this.scratch.colorMatrix(this.bloomMatrix, this.bloomMask, 1, TargetChannel.FG)
      this.scratch.colorMatrix(this.fadeMatrix, this.fadeMask, 1, TargetChannel.FG)
    } else {
      const vc = this.editorView.getVisualCursor()
      const cursorRow = vc.visualRow
      const cursorCol = vc.visualCol
      let hasFade = false
      let bloomStrength = 0
      let fadeStrength = 0

      for (let cell = 0; cell < cellCount; cell++) {
        const column = cell % this.width
        const row = Math.floor(cell / this.width)
        if ((characters[cell]! & CONTINUATION) !== CONTINUATION) {
          bloomStrength = 0
          fadeStrength = 0

          if (row === cursorRow && this.typingEnergy > 0.015) {
            const trailDist = cursorCol - 1 - column
            if (trailDist >= 0 && trailDist < WAKE_TAIL_CELLS) {
              const wake = smootherstep(clamp(1 - trailDist / WAKE_TAIL_CELLS))
              bloomStrength = Math.max(bloomStrength, wake * this.typingEnergy * 0.58)
            }
          }

          for (let r = 0; r < this.ripples.length; r++) {
            const ripple = this.ripples[r]!
            if (ripple.row !== row) continue
            if (column >= ripple.startCol && column <= ripple.endCol) {
              const bloom = 1 - smootherstep(clamp(ripple.age / KEYSTROKE_BLOOM_MS))
              bloomStrength = Math.max(bloomStrength, bloom * 0.9)
              if (!ripple.deleting && ripple.age < KEYSTROKE_FADE_MS) {
                const fade = 1 - smootherstep(clamp(ripple.age / KEYSTROKE_FADE_MS))
                fadeStrength = Math.max(fadeStrength, fade * 0.62)
                hasFade = true
              }
            } else if (column === ripple.startCol - 1 || column === ripple.endCol + 1) {
              const bloom = 1 - smootherstep(clamp(ripple.age / KEYSTROKE_BLOOM_MS))
              bloomStrength = Math.max(bloomStrength, bloom * 0.35)
            }
          }
        }

        this.bloomMask[cell * 3] = column
        this.bloomMask[cell * 3 + 1] = row
        this.bloomMask[cell * 3 + 2] = bloomStrength
        this.fadeMask[cell * 3] = column
        this.fadeMask[cell * 3 + 1] = row
        this.fadeMask[cell * 3 + 2] = fadeStrength
      }

      this.scratch.colorMatrix(this.bloomMatrix, this.bloomMask, 1, TargetChannel.FG)
      if (hasFade) {
        this.scratch.colorMatrix(this.fadeMatrix, this.fadeMask, 1, TargetChannel.FG)
      }
    }

    this.markClean()
    this._ctx.addToHitGrid(this.screenX, this.screenY, this.width, this.height, this.num)
    buffer.drawFrameBuffer(this.screenX, this.screenY, this.scratch)
    this.renderCursor(buffer)
  }

  override destroy() {
    this.scratch?.destroy()
    this.scratch = undefined
    super.destroy()
  }
}

extend({ kinetic_textarea: KineticTextareaRenderable })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    kinetic_textarea: typeof KineticTextareaRenderable
  }
}
