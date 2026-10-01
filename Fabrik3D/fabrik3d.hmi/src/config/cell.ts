/**
 * Deployment context for the operator HMI (S53).
 *
 * The reference installation drives one cell and one robot. The ids are kept in one place so the
 * control-authority scope, robot positions and jog commands can never drift apart; a multi-cell
 * deployment would replace this with the server-provided context.
 */
export const DEFAULT_CELL_ID = 'reference-cell'
export const DEFAULT_ROBOT_ID = 'robot-1'

/** Robot telemetry must match the simulator publication cadence (2 Hz) with a stale window. */
export const ROBOT_POLL_INTERVAL_MS = 1000
