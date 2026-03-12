/**
 * Calibrated joint-angle target generation for the single-conveyor
 * pallet-machining cell.
 *
 * Layout (from SingleConveyorCellLayout):
 *   Conveyor at z = −2.4  (behind robot, pallets run along X)
 *   Robot    at (0, 0, 0)
 *   CNC      at z = +3.4  (in front of robot, door faces −Z at z ≈ 2.6)
 *
 * The visual robot is scaled 1.25× (upperArm 1.05, forearm 0.88).
 * At 1.25× the effective horizontal reach is ≈ 2.4 m from the base.
 *
 * Axis-1 (Y-rotation) direction mapping (Three.js convention):
 *   axis1 =  0     → +X
 *   axis1 =  π     → −X
 *   axis1 = −π/2   → +Z  (toward CNC)
 *   axis1 = +π/2   → −Z  (toward pallet / conveyor)
 *
 * axis2 (Z) at −π/2 extends the upper arm horizontal.
 * axis3 (Z) bends the elbow: lower values → longer reach / lower height.
 * axis5 (Z) angles the wrist so the gripper points downward.
 */

import {
  SINGLE_CELL_POSITIONS,
  SINGLE_CELL_CONVEYOR,
} from './SingleConveyorCellLayout'

// ── Pallet geometry constants (must match RawMaterialPallet.vue) ──
const PALLET_W = 0.60
const PALLET_D = 0.60
const CELL_PAD = 0.02
const INNER_W = PALLET_W - 0.04
const INNER_D = PALLET_D - 0.04
const USABLE_W = INNER_W - CELL_PAD * 2
const USABLE_D = INNER_D - CELL_PAD * 2

// ── Home pose ──────────────────────────────────────────────────────

export const PALLET_HOME_POSE = [0, -0.3, 0.5, 0, 0, 0]

// ── CNC poses (CNC at +Z → axis1 = −π/2) ─────────────────────────
//
// CNC body at z = 3.4, bodyD = 1.6, rotated π.
// Door (local +Z face) is at world z ≈ 3.4 − 0.8 = 2.6.
//
// Robot reach at 1.25× scale (shoulder at ~1.0 m height):
//   axis3 = 0.80  →  reach ≈ 2.15 m  (well in front of door at 2.6)
//   axis3 = 0.45  →  reach ≈ 2.35 m  (just inside door opening)
//
// The approach pose keeps the gripper ~0.4 m in front of the door.
// The insert pose reaches only through the door opening, NOT deep
// into the chamber, to prevent the forearm from clipping the housing.

/** Safe approach in front of CNC door – clears the housing by ~0.4 m. */
const CNC_APPROACH_BASE = [-Math.PI / 2, -1.57, 0.80, 0, -1.00, 0]

/** Shallow insert through the open door (not deep into the chamber). */
const CNC_INSERT_BASE   = [-Math.PI / 2, -1.57, 0.45, 0, -1.10, 0]

// ── Pallet poses (pallet behind robot at −Z → axis1 = +π/2) ──────
//
// Conveyor at z = −2.4.  At 1.25× scale with axis3 ≈ 0.65 the
// gripper reaches z ≈ −2.1 (nearest pallet edge).

/** Above-pallet approach – safe clearance. */
const PALLET_ABOVE_BASE = [Math.PI / 2, -1.57, 0.65, 0, -1.00, 0]

/** Down at slot level for pick / place. */
const PALLET_DOWN_BASE  = [Math.PI / 2, -1.57, 0.25, 0, -1.25, 0]

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Compute the world position of a specific pallet slot.
 */
export function getSlotWorldPosition(
  palletWorldX: number,
  row: number,
  col: number,
  rows = 5,
  cols = 5,
): [number, number, number] {
  const conveyorZ = SINGLE_CELL_POSITIONS.conveyor[2]
  const surfaceY = SINGLE_CELL_CONVEYOR.surfaceY + 0.05 + 0.025 + 0.001

  const cellW = USABLE_W / cols
  const cellD = USABLE_D / rows
  const localX = -USABLE_W / 2 + (col + 0.5) * cellW
  const localZ = -USABLE_D / 2 + (row + 0.5) * cellD

  return [
    palletWorldX + localX,
    surfaceY,
    conveyorZ + localZ,
  ]
}

/**
 * Apply axis-1 yaw and axis-3 reach bias for a specific pallet slot.
 *
 * When the robot faces −Z (axis1 = +π/2):
 *   • A slot at +X → decrease axis1 (turn right)
 *   • A slot at more −Z (farther) → decrease axis3 (extend reach)
 */
function palletSlotBias(
  basePose: number[],
  palletWorldX: number,
  row: number,
  col: number,
  rows = 5,
  cols = 5,
): number[] {
  const out = [...basePose]
  const cellW = USABLE_W / cols
  const cellD = USABLE_D / rows
  const localX = -USABLE_W / 2 + (col + 0.5) * cellW
  const localZ = -USABLE_D / 2 + (row + 0.5) * cellD

  // axis1 bias: yaw correction for X offset from conveyor centre.
  // Facing −Z, positive X is to the right → decrease axis1.
  out[0] = out[0]! - (palletWorldX + localX) * 0.35

  // axis3 bias: adjust elbow for depth.
  // Positive localZ = slot closer to robot = less reach needed = raise axis3.
  out[2] = out[2]! + localZ * 0.20

  return out
}

// ── Public pose API ────────────────────────────────────────────────

/** Approach pose above a specific pallet slot (safe clearance). */
export function getPalletAbovePose(
  palletWorldX: number,
  row: number,
  col: number,
  rows = 5,
  cols = 5,
): number[] {
  return palletSlotBias(PALLET_ABOVE_BASE, palletWorldX, row, col, rows, cols)
}

/** Down pose at slot level to pick or place a part. */
export function getPalletDownPose(
  palletWorldX: number,
  row: number,
  col: number,
  rows = 5,
  cols = 5,
): number[] {
  return palletSlotBias(PALLET_DOWN_BASE, palletWorldX, row, col, rows, cols)
}

/** Approach pose in front of the CNC door. */
export function getCncApproachPose(): number[] {
  return [...CNC_APPROACH_BASE]
}

/** Insert pose inside the CNC chamber. */
export function getCncInsertPose(): number[] {
  return [...CNC_INSERT_BASE]
}
