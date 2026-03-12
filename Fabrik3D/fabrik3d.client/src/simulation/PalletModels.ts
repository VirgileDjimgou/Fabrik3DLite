/**
 * Data model for industrial pallets carrying raw material.
 */

/** Shape of the cavities stamped into the pallet tray. */
export type PalletCavityShape = 'hex' | 'square' | 'circle'

/** Type of raw material carried. */
export type RawMaterialType = 'hex-billet' | 'square-billet' | 'round-billet'

/** Per-slot processing state. */
export type SlotStatus = 'empty' | 'raw' | 'in-process' | 'machined'

/** Maps a material type to the matching cavity shape. */
export function cavityForMaterial(mat: RawMaterialType): PalletCavityShape {
  switch (mat) {
    case 'hex-billet': return 'hex'
    case 'square-billet': return 'square'
    case 'round-billet': return 'circle'
  }
}

/** Movement state of a pallet on its conveyor. */
export type PalletMovementState = 'incoming' | 'stopped' | 'outgoing' | 'removed'

/** Runtime data for one pallet on a conveyor. */
export interface PalletData {
  id: string
  rows: number
  cols: number
  cavityShape: PalletCavityShape
  materialType: RawMaterialType
  /** 2-D occupancy: true = slot has a part (raw or machined). */
  occupied: boolean[][]
  /** 2-D per-slot processing state. */
  slotStatus: SlotStatus[][]
  /** Current world X position (conveyor moves along X). */
  worldX: number
  state: PalletMovementState
}

let nextPalletId = 0

/** Create a fully-loaded pallet with all slots occupied by raw parts. */
export function createFullPallet(
  materialType: RawMaterialType,
  rows = 5,
  cols = 5,
  startX = 0,
): PalletData {
  const occupied: boolean[][] = []
  const slotStatus: SlotStatus[][] = []
  for (let r = 0; r < rows; r++) {
    occupied.push(new Array(cols).fill(true))
    slotStatus.push(new Array(cols).fill('raw' as SlotStatus))
  }
  return {
    id: `pallet-${nextPalletId++}`,
    rows,
    cols,
    cavityShape: cavityForMaterial(materialType),
    materialType,
    occupied,
    slotStatus,
    worldX: startX,
    state: 'incoming',
  }
}

// ── Slot helpers ───────────────────────────────────────────────────

/** Find the next slot that still contains a raw part (row-major scan). */
export function nextRawSlot(pallet: PalletData): [number, number] | null {
  for (let r = 0; r < pallet.rows; r++) {
    for (let c = 0; c < pallet.cols; c++) {
      if (pallet.slotStatus[r]![c] === 'raw') return [r, c]
    }
  }
  return null
}

/** Mark a slot as picked (in-process). */
export function pickSlot(pallet: PalletData, row: number, col: number): void {
  pallet.occupied[row]![col] = false
  pallet.slotStatus[row]![col] = 'in-process'
}

/** Return a machined part to the same slot. */
export function returnSlot(pallet: PalletData, row: number, col: number): void {
  pallet.occupied[row]![col] = true
  pallet.slotStatus[row]![col] = 'machined'
}

/** True when every slot is either empty or machined (no raw parts left). */
export function isPalletComplete(pallet: PalletData): boolean {
  for (let r = 0; r < pallet.rows; r++) {
    for (let c = 0; c < pallet.cols; c++) {
      const s = pallet.slotStatus[r]![c]
      if (s === 'raw' || s === 'in-process') return false
    }
  }
  return true
}
