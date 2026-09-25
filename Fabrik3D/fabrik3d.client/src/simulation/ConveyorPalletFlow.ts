/**
 * Manages periodic spawning and movement of pallets along a conveyor.
 */
import { type RawMaterialType, createFullPallet, type PalletData } from './PalletModels'

const MATERIAL_CYCLE: RawMaterialType[] = ['hex-billet', 'square-billet', 'round-billet']

export interface ConveyorFlowConfig {
  /** World X where new pallets appear. */
  spawnX: number
  /** World X where pallets stop (near robot). */
  stopX: number
  /** Conveyor speed in m/s (positive = toward stopX). */
  speed: number
  /** Seconds between spawns. */
  spawnInterval: number
  /** Minimum gap between pallets (m). */
  minGap: number
  /** Direction multiplier: +1 = increasing X, -1 = decreasing X. */
  direction: 1 | -1
}

export const DEFAULT_INCOMING_CONFIG: ConveyorFlowConfig = {
  spawnX: -4.5,
  stopX: -1.5,
  speed: 0.35,
  spawnInterval: 8,
  minGap: 0.75,
  direction: 1,
}

/** Documented physical limit of the simulated belt drive (m/s). */
export const MAX_CONVEYOR_SPEED_METERS_PER_SECOND = 2
/** Deterministic encoder constant used for the simulated position indicator. */
export const ENCODER_PULSES_PER_METER = 1_000
/** Infeed photoelectric detection window before the stop position (m). */
export const PHOTOEYE_IN_WINDOW_METERS = 1

export class ConveyorPalletFlow {
  readonly pallets: PalletData[] = []
  private readonly cfg: ConveyorFlowConfig
  private timeSinceSpawn = 0
  private materialIndex = 0
  private running = true
  private speedReference: number
  private encoderPulses = 0

  /** Fires when a new pallet is created. */
  onSpawn: ((pallet: PalletData) => void) | null = null
  /** Fires every frame with updated positions. */
  onMove: ((pallets: PalletData[]) => void) | null = null

  constructor(config: Partial<ConveyorFlowConfig> = {}) {
    this.cfg = { ...DEFAULT_INCOMING_CONFIG, ...config }
    this.speedReference = this.cfg.speed
    // Spawn the first pallet immediately.
    this.timeSinceSpawn = this.cfg.spawnInterval
  }

  get isRunning(): boolean { return this.running }
  get speedReferenceMetersPerSecond(): number { return this.speedReference }
  get actualSpeedMetersPerSecond(): number { return this.running ? this.speedReference : 0 }
  get encoderPulseCount(): number { return this.encoderPulses }
  /** Infeed photoeye: a moving pallet is inside the detection window. */
  get photoeyeIn(): boolean {
    return this.pallets.some((pallet) =>
      pallet.state === 'incoming' && Math.abs(pallet.worldX - this.cfg.stopX) <= PHOTOEYE_IN_WINDOW_METERS,
    )
  }
  /** Station photoeye: a pallet is stopped at the work position. */
  get photoeyeStation(): boolean { return this.pallets.some((pallet) => pallet.state === 'stopped') }

  /** Run/stop command. Never throws; returns whether the command was applied. */
  setRunCommand(run: boolean): boolean {
    this.running = run
    return true
  }

  /** Speed reference in m/s, clamped to the documented belt limit. */
  setSpeedReference(metersPerSecond: number): boolean {
    if (!Number.isFinite(metersPerSecond)) return false
    this.speedReference = Math.max(0, Math.min(MAX_CONVEYOR_SPEED_METERS_PER_SECOND, metersPerSecond))
    return true
  }

  resetEncoder(): void { this.encoderPulses = 0 }

  /** Call every frame with delta-time in seconds. */
  update(dt: number): void {
    if (!this.running) {
      // A stopped belt neither advances nor accumulates encoder pulses.
      this.onMove?.(this.pallets)
      return
    }

    // Spawning
    this.timeSinceSpawn += dt
    if (this.timeSinceSpawn >= this.cfg.spawnInterval && this.canSpawn()) {
      this.spawn()
      this.timeSinceSpawn = 0
    }

    // Movement
    for (const p of this.pallets) {
      if (p.state !== 'incoming') continue
      const advance = this.speedReference * dt * this.cfg.direction
      p.worldX += advance
      this.encoderPulses += Math.abs(advance) * ENCODER_PULSES_PER_METER

      // Stop when reaching the stop position
      if (this.cfg.direction > 0 && p.worldX >= this.cfg.stopX) {
        p.worldX = this.cfg.stopX
        p.state = 'stopped'
      } else if (this.cfg.direction < 0 && p.worldX <= this.cfg.stopX) {
        p.worldX = this.cfg.stopX
        p.state = 'stopped'
      }

      // Don't overlap the pallet ahead
      const idx = this.pallets.indexOf(p)
      if (idx > 0) {
        const ahead = this.pallets[idx - 1]!
        const gap = Math.abs(ahead.worldX - p.worldX)
        if (gap < this.cfg.minGap) {
          p.worldX = ahead.worldX - this.cfg.minGap * this.cfg.direction
        }
      }
    }

    this.onMove?.(this.pallets)
  }

  private canSpawn(): boolean {
    if (this.pallets.length === 0) return true
    const last = this.pallets[this.pallets.length - 1]!
    return Math.abs(last.worldX - this.cfg.spawnX) >= this.cfg.minGap
  }

  private spawn(): void {
    const mat = MATERIAL_CYCLE[this.materialIndex % MATERIAL_CYCLE.length]!
    this.materialIndex++
    const pallet = createFullPallet(mat, 5, 5, this.cfg.spawnX)
    this.pallets.push(pallet)
    this.onSpawn?.(pallet)
  }
}
