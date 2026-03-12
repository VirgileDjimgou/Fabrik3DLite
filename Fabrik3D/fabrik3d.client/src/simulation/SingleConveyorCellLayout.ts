/**
 * Centralized layout configuration for the single-conveyor industrial cell.
 *
 * The robot sits at the origin.  One conveyor runs behind it (−Z) to
 * deliver pallets, and a CNC machine sits in front (+Z).  The space
 * between robot and CNC is kept clear for arm motion.
 *
 *  Top-down  (X → right,  Z ↓ = "front" / +Z):
 *
 *        ═════════════════════════
 *           CONVEYOR  z ≈ −2.4        (runs along X, pallets arrive)
 *        ═════════════════════════
 *
 *                ROBOT (0, 0, 0)
 *
 *              ── clear zone ──
 *
 *              ┌──────────────┐
 *              │     CNC      │       z ≈ +3.4
 *              │  (door → −Z) │       door faces robot
 *              └──────────────┘
 */

// ── Positions ──────────────────────────────────────────────────────

export interface SingleCellPositions {
  robot: [number, number, number]
  cnc: [number, number, number]
  /** Y-rotation so the CNC door faces the robot (−Z). */
  cncRotationY: number
  conveyor: [number, number, number]
  /** Y-rotation to orient the conveyor belt (0 = runs along X). */
  conveyorRotationY: number
}

export const SINGLE_CELL_POSITIONS: SingleCellPositions = {
  robot:             [0,   0,    0],
  cnc:               [0,   0,    3.4],
  cncRotationY:      Math.PI,          // local +Z → world −Z
  conveyor:          [0,   0,   -2.4],
  conveyorRotationY: 0,                // belt runs along world X
}

// ── Conveyor ───────────────────────────────────────────────────────

export interface SingleCellConveyor {
  length: number
  speed: number
  /** Y where pallets rest on top of the belt surface. */
  surfaceY: number
}

export const SINGLE_CELL_CONVEYOR: SingleCellConveyor = {
  length:    6,
  speed:     0.3,
  surfaceY:  0.64,
}

// ── Pallet flow ────────────────────────────────────────────────────

export interface SingleCellFlowConfig {
  spawnX: number
  stopX: number
  speed: number
  spawnInterval: number
  minGap: number
  direction: 1 | -1
}

/**
 * Conveyor centre X = 0, half-length = 3 → belt spans −3 … +3.
 * Pallets spawn just outside the left end and stop near the centre
 * (x ≈ 0, directly behind the robot).
 */
export const SINGLE_CELL_FLOW: SingleCellFlowConfig = {
  spawnX:        -3.8,
  stopX:          0,
  speed:          0.3,
  spawnInterval:  12,
  minGap:         0.85,
  direction:      1,
}

// ── Camera ─────────────────────────────────────────────────────────

export interface SingleCellCamera {
  position: [number, number, number]
  target: [number, number, number]
}

export const SINGLE_CELL_CAMERA: SingleCellCamera = {
  position: [5.5, 5.5, -5.5],
  target:   [0, 0.5, 0.5],
}
