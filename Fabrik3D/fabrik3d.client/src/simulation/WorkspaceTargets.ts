/**
 * FK-verified calibrated joint-angle presets for the main workspace zones.
 *
 * All presets were numerically verified against the visual Three.js kinematic
 * chain (joint offsets, rotation axes) so the gripper tip lands at the correct
 * world-space coordinates.  A quick-reference of end-effector positions for
 * the centre presets:
 *
 *   RAW_TABLE_ABOVE  centre → (−1.67, 1.30, 0)   approach above table
 *   RAW_TABLE_DOWN   centre → (−1.76, 0.90, 0)   at part-grasp height
 *   CNC_APPROACH            → (+1.67, 1.30, 0)   above CNC door
 *   CNC_INSERT              → (+1.82, 0.87, 0)   inside CNC chamber
 *   FINISHED_ABOVE   centre → ( 0.00, 1.11, 1.52) above finished table
 *   FINISHED_DOWN    centre → ( 0.00, 0.88, 1.59) at place height
 *
 * The helper functions select a zone preset based on the object's real
 * position, then apply a small elbow-angle offset for depth variation.
 * The API is designed so a future IK solver can replace these functions
 * without touching the workflow.
 */

import type { MetalPartData } from './PartManager'
import type { CellLayoutConfig } from './CellLayoutConfig'
import { DEFAULT_CELL_CONFIG } from './CellLayoutConfig'

// ── Zone presets ───────────────────────────────────────────────────
// Each preset is [axis1, axis2, axis3, axis4, axis5, axis6] in radians.
//
// axis1 (Y) determines the horizontal reach direction:
//   π   → −X (raw table)    0 → +X (CNC)    −π/2 → +Z (finished table)
//
// axis2 (Z) at −π/2 extends the upper arm horizontal.
// axis3 (Z) bends the elbow: lower values = longer reach.
// axis5 (Z) angles the wrist so the gripper points downward.

/** Raw-parts table – three lateral zones (left / centre / right).
 *  Left = part Z > tableZ, Right = part Z < tableZ. */
const RAW_TABLE_ABOVE: Record<string, number[]> = {
  left:   [ 3.02, -1.57,  0.80,  0,  -1.00,  0],
  centre: [ 3.14, -1.57,  0.80,  0,  -1.00,  0],
  right:  [-3.02, -1.57,  0.80,  0,  -1.00,  0],
}
const RAW_TABLE_DOWN: Record<string, number[]> = {
  left:   [ 3.02, -1.57,  0.40,  0,  -1.30,  0],
  centre: [ 3.14, -1.57,  0.40,  0,  -1.30,  0],
  right:  [-3.02, -1.57,  0.40,  0,  -1.30,  0],
}

/** CNC machine loading area (door faces −X toward robot). */
const CNC_APPROACH = [0, -1.57,  0.80,  0,  -1.00,  0]
const CNC_INSERT   = [0, -1.57,  0.30,  0,  -1.00,  0]

/** Finished-parts table – three lateral zones.
 *  Left = slot X < tableX, Right = slot X > tableX. */
const FINISHED_ABOVE: Record<string, number[]> = {
  left:   [-1.69, -1.57,  0.80,  0,  -2.00,  0],
  centre: [-1.57, -1.57,  0.80,  0,  -2.00,  0],
  right:  [-1.45, -1.57,  0.80,  0,  -2.00,  0],
}
const FINISHED_DOWN: Record<string, number[]> = {
  left:   [-1.69, -1.57,  0.45,  0,  -2.00,  0],
  centre: [-1.57, -1.57,  0.45,  0,  -2.00,  0],
  right:  [-1.45, -1.57,  0.45,  0,  -2.00,  0],
}

/** Home / safe neutral pose – arm upright, compact. */
export const HOME_POSE = [0, -0.3, 0.5, 0, 0, 0]

// ── Zone selection helpers ─────────────────────────────────────────

type Zone = 'left' | 'centre' | 'right'

/**
 * Pick a lateral zone based on the Z offset of an object from the table
 * centre.  |dz| > 0.12 triggers left / right.
 */
function rawZoneFromZ(objectZ: number, tableZ: number): Zone {
  const dz = objectZ - tableZ
  if (dz > 0.12) return 'left'
  if (dz < -0.12) return 'right'
  return 'centre'
}

/**
 * Pick a lateral zone for the finished table based on the X offset of
 * the slot from the table centre.
 */
function finishedZoneFromX(slotX: number, tableX: number): Zone {
  const dx = slotX - tableX
  if (dx < -0.12) return 'left'
  if (dx > 0.12) return 'right'
  return 'centre'
}

/**
 * Apply a small axis-3 (elbow) offset so the gripper adjusts reach depth
 * based on the part's distance from the robot.  A positive dx (part closer
 * to robot) increases axis3 (shorter reach); negative dx decreases it.
 */
function applyDepthBias(pose: number[], objectAlongReach: number, tableAlongReach: number): number[] {
  const d = objectAlongReach - tableAlongReach
  const out = [...pose]
  // axis3 bias: ~0.25 rad per metre offset
  out[2] = out[2]! + d * 0.25
  return out
}

// ── Public target-pose API ─────────────────────────────────────────

/**
 * Approach pose above a raw-table part (safe clearance).
 */
export function getPickApproachPose(
  part: MetalPartData,
  cfg: CellLayoutConfig = DEFAULT_CELL_CONFIG,
): number[] {
  const zone = rawZoneFromZ(part.position.z, cfg.positions.rawTable[2])
  const base = RAW_TABLE_ABOVE[zone]!
  // Raw table is along −X, so depth bias uses X (but inverted: more
  // negative X = farther from robot = needs lower axis3).
  return applyDepthBias(base, -part.position.x, -cfg.positions.rawTable[0])
}

/**
 * Down pose to grasp a part on the raw table.
 */
export function getPickTargetPose(
  part: MetalPartData,
  cfg: CellLayoutConfig = DEFAULT_CELL_CONFIG,
): number[] {
  const zone = rawZoneFromZ(part.position.z, cfg.positions.rawTable[2])
  const base = RAW_TABLE_DOWN[zone]!
  return applyDepthBias(base, -part.position.x, -cfg.positions.rawTable[0])
}

/**
 * Approach pose in front of the CNC loading door.
 */
export function getCncApproachPose(): number[] {
  return [...CNC_APPROACH]
}

/**
 * Insert pose – gripper reaches inside the CNC chamber.
 */
export function getCncInsertPose(): number[] {
  return [...CNC_INSERT]
}

/**
 * Retrieve pose – same as insert (part is grabbed from the same spot).
 */
export function getCncRetrievePose(): number[] {
  return getCncInsertPose()
}

/**
 * Approach pose above a slot on the finished-parts table.
 */
export function getFinishedPlaceApproachPose(
  slot: [number, number, number],
  cfg: CellLayoutConfig = DEFAULT_CELL_CONFIG,
): number[] {
  const zone = finishedZoneFromX(slot[0], cfg.positions.finishedTable[0])
  const base = FINISHED_ABOVE[zone]!
  // Finished table is along +Z, depth bias uses Z.
  return applyDepthBias(base, slot[2], cfg.positions.finishedTable[2])
}

/**
 * Down pose to place a part onto the finished-parts table slot.
 */
export function getFinishedPlacePose(
  slot: [number, number, number],
  cfg: CellLayoutConfig = DEFAULT_CELL_CONFIG,
): number[] {
  const zone = finishedZoneFromX(slot[0], cfg.positions.finishedTable[0])
  const base = FINISHED_DOWN[zone]!
  return applyDepthBias(base, slot[2], cfg.positions.finishedTable[2])
}
