/**
 * Centralized configuration for the robotic manufacturing cell.
 *
 * All spatial positions, heights and timing values live here so the
 * layout can be tuned in one place without touching the workflow or
 * individual components.
 */

// ── World positions (metres) ───────────────────────────────────────

export interface CellPositions {
  /** Robot base (always origin). */
  robotBase: [number, number, number]
  /** Raw-parts work-table centre. */
  rawTable: [number, number, number]
  /** CNC machine centre. */
  cnc: [number, number, number]
  /** Point directly in front of the CNC loading door (world). */
  cncLoadPoint: [number, number, number]
  /** Finished-parts table centre. */
  finishedTable: [number, number, number]
  /** Conveyor belt centre. */
  conveyor: [number, number, number]
}

export const DEFAULT_CELL_POSITIONS: CellPositions = {
  robotBase:      [0,    0, 0],
  rawTable:       [-2.0, 0, 0],
  cnc:            [2.5,  0, 0],
  cncLoadPoint:   [1.88, 0.85, 0],   // front-face of rotated CNC
  finishedTable:  [0,    0, 1.5],
  conveyor:       [4.5,  0, 0],
}

// ── Vertical heights ───────────────────────────────────────────────

export interface CellHeights {
  /** Safe travel height (Y) to clear all obstacles. */
  safeTravel: number
  /** Y of raw-table surface (world). */
  rawTableSurface: number
  /** Y at which the gripper grasps a part on the raw table. */
  pickHeight: number
  /** Y of the CNC loading point. */
  cncInsertHeight: number
  /** Y of the finished-table surface (world). */
  finishedTableSurface: number
  /** Y at which the gripper releases a part on the finished table. */
  placeHeight: number
}

export const DEFAULT_CELL_HEIGHTS: CellHeights = {
  safeTravel:            1.8,
  rawTableSurface:       0.87,
  pickHeight:            0.92,
  cncInsertHeight:       0.85,
  finishedTableSurface:  0.87,
  placeHeight:           0.92,
}

// ── Motion timing (seconds) ────────────────────────────────────────

export interface CellTiming {
  /** Long cross-workspace travel. */
  travelDuration: number
  /** Short vertical approach / retract. */
  approachDuration: number
  /** Dwell while gripper closes or opens. */
  gripDuration: number
  /** Wait for CNC door to finish animating. */
  doorWait: number
  /** CNC machining time (should match CNCMachine prop). */
  machiningDuration: number
}

export const DEFAULT_CELL_TIMING: CellTiming = {
  travelDuration:   3.0,
  approachDuration: 1.2,
  gripDuration:     0.8,
  doorWait:         1.0,
  machiningDuration: 5.0,
}

// ── Aggregate config ───────────────────────────────────────────────

export interface CellLayoutConfig {
  positions: CellPositions
  heights: CellHeights
  timing: CellTiming
}

export const DEFAULT_CELL_CONFIG: CellLayoutConfig = {
  positions: DEFAULT_CELL_POSITIONS,
  heights: DEFAULT_CELL_HEIGHTS,
  timing: DEFAULT_CELL_TIMING,
}
