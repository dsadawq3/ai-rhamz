import { MacOSScrollAccel, type ScrollAcceleration } from "@opentui/core"

export type ScrollConfig = {
  scroll?: {
    acceleration?: boolean
    speed?: number
  }
}

export class CustomSpeedScroll implements ScrollAcceleration {
  private lastTick = 0
  private streak = 0

  constructor(private speed: number) {}

  tick(now = Date.now()): number {
    const dt = now - this.lastTick
    this.lastTick = now
    if (dt > 0 && dt < 95) {
      this.streak = Math.min(8, this.streak + 1)
    } else if (dt > 180) {
      this.streak = 0
    }
    return Math.min(16, this.speed + Math.floor(this.streak * 1.3))
  }

  reset(): void {
    this.streak = 0
    this.lastTick = 0
  }
}

export function getScrollAcceleration(config?: ScrollConfig): ScrollAcceleration {
  if (config?.scroll?.acceleration) {
    return new MacOSScrollAccel()
  }
  if (config?.scroll?.speed !== undefined) {
    return new CustomSpeedScroll(config.scroll.speed)
  }

  return new CustomSpeedScroll(5)
}

