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

export class ConveyorPalletFlow {
  readonly pallets: PalletData[] = []
  private readonly cfg: ConveyorFlowConfig
  private timeSinceSpawn = 0
  private materialIndex = 0

  /** Fires when a new pallet is created. */
  onSpawn: ((pallet: PalletData) => void) | null = null
  /** Fires every frame with updated positions. */
  onMove: ((pallets: PalletData[]) => void) | null = null

  constructor(config: Partial<ConveyorFlowConfig> = {}) {
    this.cfg = { ...DEFAULT_INCOMING_CONFIG, ...config }
    // Spawn the first pallet immediately.
    this.timeSinceSpawn = this.cfg.spawnInterval
  }

  /** Call every frame with delta-time in seconds. */
  update(dt: number): void {
    // Spawning
    this.timeSinceSpawn += dt
    if (this.timeSinceSpawn >= this.cfg.spawnInterval && this.canSpawn()) {
      this.spawn()
      this.timeSinceSpawn = 0
    }

    // Movement
    for (const p of this.pallets) {
      if (p.state !== 'incoming') continue
      const advance = this.cfg.speed * dt * this.cfg.direction
      p.worldX += advance

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
