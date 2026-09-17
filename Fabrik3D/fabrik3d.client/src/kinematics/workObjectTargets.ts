import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import { FRAME_IDS } from './frames'
import type { KinematicPose } from './types'

// These dimensions intentionally mirror the current pallet geometry.
const PALLET_WIDTH_METERS = 0.6
const PALLET_DEPTH_METERS = 0.6
const PALLET_INNER_EDGE_METERS = 0.04
const PALLET_CELL_PADDING_METERS = 0.02
const PART_SURFACE_HEIGHT_METERS = 0.05 + 0.025 + 0.001

export interface WorkObjectTarget {
  id: string
  workObjectFrameId: string
  pose: KinematicPose
  purpose: 'pallet-approach' | 'pallet-pick' | 'cnc-approach' | 'cnc-insert'
}

/** Returns a pallet slot target in world coordinates, with explicit work-object metadata. */
export function createPalletSlotTarget(
  palletWorldX: number,
  row: number,
  col: number,
  rows = 5,
  cols = 5,
  clearanceMeters = 0,
): WorkObjectTarget {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) throw new Error('Pallet slot is outside the declared matrix.')
  const usableWidth = PALLET_WIDTH_METERS - PALLET_INNER_EDGE_METERS - PALLET_CELL_PADDING_METERS * 2
  const usableDepth = PALLET_DEPTH_METERS - PALLET_INNER_EDGE_METERS - PALLET_CELL_PADDING_METERS * 2
  const x = palletWorldX - usableWidth / 2 + (col + 0.5) * (usableWidth / cols)
  const z = SINGLE_CELL_POSITIONS.conveyor[2] - usableDepth / 2 + (row + 0.5) * (usableDepth / rows)
  return {
    id: `pallet-slot-r${row}-c${col}-${clearanceMeters > 0 ? 'approach' : 'pick'}`,
    workObjectFrameId: FRAME_IDS.palletWorkObject,
    pose: { frameId: FRAME_IDS.world, position: { x, y: SINGLE_CELL_CONVEYOR.surfaceY + PART_SURFACE_HEIGHT_METERS + clearanceMeters, z }, orientation: downwardToolOrientation() },
    purpose: clearanceMeters > 0 ? 'pallet-approach' : 'pallet-pick',
  }
}

/** CNC targets are expressed from the known machine work object, then exported in world coordinates. */
export function createCncTarget(kind: 'approach' | 'insert'): WorkObjectTarget {
  const zOffset = kind === 'approach' ? -1.1 : -0.9
  return {
    id: `cnc-${kind}`,
    workObjectFrameId: FRAME_IDS.cncWorkObject,
    pose: { frameId: FRAME_IDS.world, position: { x: SINGLE_CELL_POSITIONS.cnc[0], y: 1.05, z: SINGLE_CELL_POSITIONS.cnc[2] + zOffset }, orientation: downwardToolOrientation() },
    purpose: kind === 'approach' ? 'cnc-approach' : 'cnc-insert',
  }
}

function downwardToolOrientation() { return { x: 1, y: 0, z: 0, w: 0 } }
