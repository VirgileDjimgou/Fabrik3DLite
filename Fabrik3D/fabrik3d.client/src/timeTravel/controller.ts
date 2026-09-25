import { extractMarkers, windowRange } from './markers'
import { reconstructCell } from './reconstruction'
import type { ReconstructionInput, ReconstructionSnapshot, TimelineMarker } from './types'

/**
 * Deterministic time-travel controller (S41).
 *
 * The controller owns a logical cursor expressed in epoch milliseconds. Playback
 * and stepping depend only on the logical delta passed to `advance`, never on
 * wall-clock time or frame rate, so the same sequence of advances always reaches
 * the same cursor and snapshot.
 *
 * The controller is read-only by construction: it exposes no command, connector
 * or authority method. Its only output is a `ReconstructionSnapshot` with
 * `readOnly: true`.
 */

export const DEFAULT_STEP_MS = 500
export const MIN_SPEED = 0.25
export const MAX_SPEED = 8

export interface TimeTravelControllerOptions {
  /** Fixed logical step used by `stepForward` / `stepBackward`, in milliseconds. */
  stepMs?: number
  /** Initial playback speed multiplier. */
  speed?: number
  /** Initial cursor time (ISO). Defaults to the start of the recorded window. */
  startTime?: string
}

export class TimeTravelController {
  readonly markers: readonly TimelineMarker[]
  private readonly stepMs: number
  private readonly startMs: number
  private readonly endMs: number
  private cursor: number
  private playing = false
  private speedValue: number

  constructor(
    private readonly input: ReconstructionInput,
    options: TimeTravelControllerOptions = {},
  ) {
    this.stepMs = Math.max(1, options.stepMs ?? DEFAULT_STEP_MS)
    this.speedValue = clamp(options.speed ?? 1, MIN_SPEED, MAX_SPEED)
    this.markers = extractMarkers(input.records)
    const range = windowRange(input.records, input.trajectory)
    const fallback = Date.parse(options.startTime ?? '') || Date.now()
    this.startMs = range?.startMs ?? fallback
    this.endMs = range?.endMs ?? fallback
    this.cursor = clamp(Date.parse(options.startTime ?? '') || this.startMs, this.startMs, this.endMs)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get speed(): number {
    return this.speedValue
  }

  get rangeMs(): { startMs: number; endMs: number } {
    return { startMs: this.startMs, endMs: this.endMs }
  }

  get cursorMs(): number {
    return this.cursor
  }

  play(): void {
    if (this.cursor >= this.endMs) this.cursor = this.startMs
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  setSpeed(speed: number): number {
    this.speedValue = clamp(speed, MIN_SPEED, MAX_SPEED)
    return this.speedValue
  }

  seekMs(targetMs: number): ReconstructionSnapshot {
    this.cursor = clamp(targetMs, this.startMs, this.endMs)
    return this.snapshot()
  }

  seekTo(targetTime: string): ReconstructionSnapshot {
    const parsed = Date.parse(targetTime)
    return this.seekMs(Number.isFinite(parsed) ? parsed : this.cursor)
  }

  stepForward(): ReconstructionSnapshot {
    this.playing = false
    this.cursor = Math.min(this.endMs, this.cursor + this.stepMs)
    return this.snapshot()
  }

  stepBackward(): ReconstructionSnapshot {
    this.playing = false
    this.cursor = Math.max(this.startMs, this.cursor - this.stepMs)
    return this.snapshot()
  }

  /**
   * Advances playback by a logical delta. Frame-rate independent: the cursor
   * only depends on the accumulated logical delta and the current speed.
   */
  advance(logicalDeltaMs: number): ReconstructionSnapshot {
    if (this.playing && Number.isFinite(logicalDeltaMs) && logicalDeltaMs > 0) {
      this.cursor = clamp(this.cursor + logicalDeltaMs * this.speedValue, this.startMs, this.endMs)
      if (this.cursor >= this.endMs) this.playing = false
    }
    return this.snapshot()
  }

  jumpToMarker(marker: TimelineMarker | string): ReconstructionSnapshot {
    const target = typeof marker === 'string' ? this.markers.find((candidate) => candidate.id === marker) : marker
    if (!target) return this.snapshot()
    this.playing = false
    return this.seekTo(target.timestamp)
  }

  snapshot(): ReconstructionSnapshot {
    return reconstructCell(this.input, new Date(this.cursor).toISOString())
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
