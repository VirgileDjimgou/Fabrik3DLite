/**
 * Centralized layout configuration for the dual-conveyor industrial cell.
 *
 * All element positions are defined here so the layout can be tuned in
 * one place.  The robot base is the origin (0, 0, 0).
 *
 *  Top-down view  (X → right,  Z → into screen / "front"):
 *
 *            LEFT CONVEYOR              RIGHT CONVEYOR
 *            (incoming raw)             (outgoing finished)
 *         ═══════════════════        ═══════════════════
 *         x ≈ −2.1, z ≈ 0.3         x ≈ +2.1, z ≈ 0.3
 *
 *                         ROBOT (0, 0, 0)
 *
 *                        ┌───────────┐
 *                        │    CNC    │   z ≈ +2.5
 *                        │  (door→−Z)│   door faces robot
 *                        └───────────┘
 */

// ── Element positions ──────────────────────────────────────────────

export interface DualCellPositions {
  robot: [number, number, number]
  cnc: [number, number, number]
  /** Y-rotation so the CNC door faces the robot. */
  cncRotationY: number
  leftConveyor: [number, number, number]
  rightConveyor: [number, number, number]
}

export const DUAL_CELL_POSITIONS: DualCellPositions = {
  robot:          [0,     0,   0],
  cnc:            [0,     0,   2.5],
  cncRotationY:   Math.PI,      // door (local +Z) rotated to face −Z → robot
  leftConveyor:   [-2.1,  0,   0.3],
  rightConveyor:  [2.1,   0,   0.3],
}

// ── Conveyor dimensions ────────────────────────────────────────────

export interface DualCellConveyorConfig {
  length: number
  /** Speed in m/s (positive = belt moves toward +X). */
  incomingSpeed: number
  outgoingSpeed: number
  /** Y height of the conveyor surface where pallets rest. */
  surfaceY: number
}

export const DUAL_CELL_CONVEYORS: DualCellConveyorConfig = {
  length:         6,
  incomingSpeed:  0.3,
  outgoingSpeed:  0.2,
  surfaceY:       0.64,
}

// ── Pallet flow (left / incoming) ──────────────────────────────────

export interface DualCellFlowConfig {
  spawnX: number
  stopX: number
  speed: number
  spawnInterval: number
  minGap: number
  direction: 1 | -1
}

/**
 * Pallets spawn at the far-left end of the left conveyor and move
 * toward the robot pickup zone (right end of that conveyor).
 * Conveyor centre X = −2.1, half-length = 3 → belt spans −5.1 … +0.9.
 * Pallets spawn outside the visible belt and stop near x = −0.8 (robot side).
 */
export const LEFT_FLOW_CONFIG: DualCellFlowConfig = {
  spawnX:        -5.5,
  stopX:         -0.8,
  speed:          0.3,
  spawnInterval:  10,
  minGap:         0.85,
  direction:      1,
}

// ── Camera defaults ────────────────────────────────────────────────

export interface DualCellCamera {
  position: [number, number, number]
  target: [number, number, number]
}

export const DUAL_CELL_CAMERA: DualCellCamera = {
  position: [0, 7, -7],
  target:   [0, 0.6, 0.8],
}
