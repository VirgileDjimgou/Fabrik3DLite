/**
 * Data model for industrial pallets carrying raw material.
 */

/** Shape of the cavities stamped into the pallet tray. */
export type PalletCavityShape = 'hex' | 'square' | 'circle'

/** Type of raw material carried. */
export type RawMaterialType = 'hex-billet' | 'square-billet' | 'round-billet'

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
  /** 2-D occupancy: true = slot has a part. */
  occupied: boolean[][]
  /** Current world X position (conveyor moves along X). */
  worldX: number
  state: PalletMovementState
}

let nextPalletId = 0

/** Create a fully-loaded pallet with all slots occupied. */
export function createFullPallet(
  materialType: RawMaterialType,
  rows = 5,
  cols = 5,
  startX = 0,
): PalletData {
  const occupied: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    occupied.push(new Array(cols).fill(true))
  }
  return {
    id: `pallet-${nextPalletId++}`,
    rows,
    cols,
    cavityShape: cavityForMaterial(materialType),
    materialType,
    occupied,
    worldX: startX,
    state: 'incoming',
  }
}
