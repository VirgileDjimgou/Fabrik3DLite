/**
 * S66 scenario robot motion plans.
 *
 * Pure, deterministic data describing how each existing material-flow scenario
 * cell requests six-axis motion from the existing robot stack. The plans contain
 * no Three.js objects, no controller and no scenario truth: they map a scenario
 * cell kind to an ordered list of joint-space waypoints, the generic robot
 * profile whose limits/kinematics apply, and which phases carry a workpiece.
 *
 * `ScenarioRobotMotionAdapter` consumes a plan and drives the existing
 * `RobotController`; `ScenarioRuntimeHost` pushes authoritative scenario state
 * into the adapter. The adapter never writes scenario state back.
 */

import type { ScenarioCellKind } from './cellComposition'

export const SCENARIO_ROBOT_MOTION_SCHEMA_VERSION = '1.0' as const

/** Stable phase identifiers reused as `MotionSafetyEngine` phase names. */
export type ScenarioMotionPhase =
  | 'SCENARIO_HOME'
  | 'APPROACH_PICK'
  | 'PICK_PART'
  | 'LIFT_FROM_PICK'
  | 'TRANSFER_PART'
  | 'APPROACH_PLACE'
  | 'PLACE_PART'
  | 'RELEASE_PART'
  | 'RETREAT_FROM_PLACE'
  | 'INSPECTION_POSE'
  | 'DEMONSTRATE_MOTION'

export interface ScenarioMotionWaypoint {
  /** Stable phase id, also used by the motion-safety engine. */
  phase: ScenarioMotionPhase
  /** Target joint angles in radians, ordered J1…J6. */
  targetJointsRad: readonly number[]
  /** Deterministic simulation-time duration of the segment, in seconds. */
  durationSeconds: number
  /** True while the tool is holding the cell workpiece. */
  carrying: boolean
}

export interface ScenarioMotionPlan {
  schemaVersion: typeof SCENARIO_ROBOT_MOTION_SCHEMA_VERSION
  kind: ScenarioCellKind
  /** Catalog robot profile id whose limits/kinematics drive the motion. */
  robotProfileId: string
  waypoints: readonly ScenarioMotionWaypoint[]
}

/** Home / safe neutral pose shared with the existing workspace targets. */
export const SCENARIO_HOME_JOINTS: readonly number[] = Object.freeze([0, -0.3, 0.5, 0, 0, 0])

function wp(
  phase: ScenarioMotionPhase,
  targetJointsRad: readonly number[],
  durationSeconds: number,
  carrying = false,
): ScenarioMotionWaypoint {
  return Object.freeze({ phase, targetJointsRad: Object.freeze([...targetJointsRad]), durationSeconds, carrying })
}

/**
 * Palletizing: home, approach box, pick, lift, transfer, approach pallet,
 * place, release, retreat, home.
 */
const PALLETIZING_WAYPOINTS: readonly ScenarioMotionWaypoint[] = Object.freeze([
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 1.0),
  wp('APPROACH_PICK', [1.9, -1.1, 0.65, 0, -0.85, 0], 1.1),
  wp('PICK_PART', [2.0, -1.45, 0.32, 0, -1.25, 0], 0.8),
  wp('LIFT_FROM_PICK', [2.0, -1.15, 0.6, 0, -1.0, 0], 0.8, true),
  wp('TRANSFER_PART', [1.1, -1.25, 0.75, 0.2, -0.95, 0.2], 1.2, true),
  wp('APPROACH_PLACE', [0.5, -1.1, 0.65, 0, -0.85, 0], 0.8, true),
  wp('PLACE_PART', [0.45, -1.45, 0.3, 0, -1.25, 0], 0.8, true),
  wp('RELEASE_PART', [0.45, -1.45, 0.3, 0, -1.25, Math.PI / 2], 0.4),
  wp('RETREAT_FROM_PLACE', [0.5, -1.1, 0.65, 0, -0.85, 0], 0.8),
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 1.0),
])

/**
 * Assembly / inspection: home, approach source, pick part, approach fixture,
 * place, retreat, inspection pose, home.
 */
const ASSEMBLY_WAYPOINTS: readonly ScenarioMotionWaypoint[] = Object.freeze([
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 0.9),
  wp('APPROACH_PICK', [-1.7, -1.0, 0.7, 0, -0.8, 0], 1.0),
  wp('PICK_PART', [-1.8, -1.35, 0.35, 0, -1.2, 0], 0.7),
  wp('LIFT_FROM_PICK', [-1.8, -1.05, 0.65, 0, -0.95, 0], 0.7, true),
  wp('TRANSFER_PART', [-0.5, -1.2, 0.8, 0.15, -0.9, 0.15], 1.1, true),
  wp('APPROACH_PLACE', [0.7, -1.0, 0.7, 0, -0.8, 0], 0.8, true),
  wp('PLACE_PART', [0.75, -1.35, 0.32, 0, -1.2, 0], 0.7, true),
  wp('RELEASE_PART', [0.75, -1.35, 0.32, 0, -1.2, Math.PI / 2], 0.4),
  wp('RETREAT_FROM_PLACE', [0.7, -1.0, 0.7, 0, -0.8, 0], 0.7),
  wp('INSPECTION_POSE', [0, -0.9, 0.55, 0.3, -0.7, 0.5], 1.0),
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 0.9),
])

/**
 * Safety training: limited demonstrative motion. It is requested exactly like
 * the other cells, but the adapter inhibits it while any simulated safety
 * condition is active and only resumes after controlled recovery.
 */
const SAFETY_WAYPOINTS: readonly ScenarioMotionWaypoint[] = Object.freeze([
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 1.0),
  wp('DEMONSTRATE_MOTION', [0.6, -0.9, 0.7, 0.2, -0.6, 0.4], 0.9),
  wp('DEMONSTRATE_MOTION', [-0.6, -0.9, 0.7, -0.2, -0.6, -0.4], 0.9),
  wp('SCENARIO_HOME', SCENARIO_HOME_JOINTS, 0.9),
])

/**
 * S69 composition note: the profile per cell is chosen so the cell's declared
 * robot service targets are inside the physical envelope and the guarding sits
 * outside it. Palletizing handles light cartons and uses the medium arm, whose
 * envelope services every box/pallet target yet fits inside the repositioned
 * back fence; safety training demonstrates limited motion and uses the compact
 * arm inside its repositioned training fence.
 */
const PLANS: Readonly<Record<string, ScenarioMotionPlan>> = Object.freeze({
  'robot-palletizing': Object.freeze({
    schemaVersion: SCENARIO_ROBOT_MOTION_SCHEMA_VERSION,
    kind: 'robot-palletizing',
    robotProfileId: 'medium-6axis',
    waypoints: PALLETIZING_WAYPOINTS,
  }),
  'assembly-inspection': Object.freeze({
    schemaVersion: SCENARIO_ROBOT_MOTION_SCHEMA_VERSION,
    kind: 'assembly-inspection',
    robotProfileId: 'compact-6axis',
    waypoints: ASSEMBLY_WAYPOINTS,
  }),
  'robot-safety-training': Object.freeze({
    schemaVersion: SCENARIO_ROBOT_MOTION_SCHEMA_VERSION,
    kind: 'robot-safety-training',
    robotProfileId: 'compact-6axis',
    waypoints: SAFETY_WAYPOINTS,
  }),
})

/** A plan with no motion for cells that are not S66 robot-motion cells. */
export function emptyScenarioMotionPlan(kind: ScenarioCellKind): ScenarioMotionPlan {
  return { schemaVersion: SCENARIO_ROBOT_MOTION_SCHEMA_VERSION, kind, robotProfileId: 'medium-6axis', waypoints: [] }
}

/** Resolves the deterministic motion plan for a scenario cell kind. */
export function createScenarioMotionPlan(kind: ScenarioCellKind): ScenarioMotionPlan {
  return PLANS[kind] ?? emptyScenarioMotionPlan(kind)
}

/** True when the cell kind has a declared robot motion plan. */
export function hasScenarioRobotMotion(kind: ScenarioCellKind): boolean {
  return (PLANS[kind]?.waypoints.length ?? 0) > 0
}

/** Simulated safety conditions that inhibit scenario robot motion. */
export interface ScenarioMotionSafetyConditions {
  emergencyStop: boolean
  gateOpen: boolean
  scannerMuted: boolean
}

export type ScenarioMotionBlockReason = 'emergency-stop' | 'interlock-open' | 'scanner-muted'

/**
 * Reports the first active simulated safety condition that must inhibit motion.
 * Higher-severity E-stop is reported before the interlock and the muted scanner.
 */
export function motionInhibitReason(conditions: ScenarioMotionSafetyConditions): ScenarioMotionBlockReason | null {
  if (conditions.emergencyStop) return 'emergency-stop'
  if (conditions.gateOpen) return 'interlock-open'
  if (conditions.scannerMuted) return 'scanner-muted'
  return null
}

/** Extracts the safety conditions the adapter gates on from a visible cell state. */
export function scenarioMotionSafetyConditions(state: {
  emergencyStop: boolean
  gateOpen: boolean
  scannerMuted: boolean
}): ScenarioMotionSafetyConditions {
  return {
    emergencyStop: state.emergencyStop,
    gateOpen: state.gateOpen,
    scannerMuted: state.scannerMuted,
  }
}
