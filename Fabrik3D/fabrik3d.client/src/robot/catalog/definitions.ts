import { DEFAULT_JOINT_LIMITS } from '../../simulation/AxisLimits'
import { CAPSULE_COLLISION_MODEL_ID, PROCEDURAL_VISUAL_ASSET_ID } from './assets'
import type { JointDefinition, RobotDefinition, ToolDefinition } from './types'

const SIX_AXIS_JOINT_NAMES = [
  'Base rotation',
  'Shoulder',
  'Elbow',
  'Wrist roll',
  'Wrist pitch',
  'Flange rotation',
] as const

function joints(min: readonly number[], max: readonly number[]): JointDefinition[] {
  return SIX_AXIS_JOINT_NAMES.map((name, i) => ({
    id: `j${i + 1}`,
    name,
    minRad: min[i]!,
    maxRad: max[i]!,
  }))
}

const rad = (degrees: number) => (degrees * Math.PI) / 180

/**
 * Default compatibility profile — migrates the current single-conveyor
 * robot (same dimensions, same joint limits) into the catalog.
 */
export const MEDIUM_6AXIS: RobotDefinition = {
  id: 'medium-6axis',
  name: 'Medium 6-axis',
  description: 'General-purpose six-axis arm, default compatibility profile for the single-conveyor cell.',
  payloadKg: 12,
  reachMeters: 1.4,
  joints: joints(
    DEFAULT_JOINT_LIMITS.map((l) => l.min),
    DEFAULT_JOINT_LIMITS.map((l) => l.max),
  ),
  baseFrame: { id: 'base', description: 'Mounted at the cell floor origin.' },
  toolFrame: { id: 'flange', description: 'Tool flange at the wrist.' },
  dimensions: { scale: 1.25, upperArmLength: 1.05, forearmLength: 0.88 },
  visualAsset: PROCEDURAL_VISUAL_ASSET_ID,
  collisionModel: CAPSULE_COLLISION_MODEL_ID,
  controllerProfile: 'generic-position',
  vendor: { vendor: 'Fabrik3D', family: 'Educational 6-axis', note: 'Generic medium-payload arm for education.' },
}

/** Compact profile: small payload and reach, tighter wrist limits. */
export const COMPACT_6AXIS: RobotDefinition = {
  id: 'compact-6axis',
  name: 'Compact 6-axis',
  description: 'Small-footprint six-axis arm for light parts and bench-top cells.',
  payloadKg: 3,
  reachMeters: 0.7,
  joints: joints(
    [-180, -90, -150, -180, -120, -360].map(rad),
    [180, 135, 150, 180, 120, 360].map(rad),
  ),
  baseFrame: { id: 'base', description: 'Bench or floor mounted.' },
  toolFrame: { id: 'flange', description: 'Compact tool flange.' },
  dimensions: { scale: 0.8, upperArmLength: 0.7, forearmLength: 0.55 },
  visualAsset: PROCEDURAL_VISUAL_ASSET_ID,
  collisionModel: CAPSULE_COLLISION_MODEL_ID,
  controllerProfile: 'generic-position',
  vendor: { vendor: 'Fabrik3D', family: 'Educational compact', note: 'Generic small-payload arm for education.' },
}

/** Heavy profile: large payload and reach, wider base rotation. */
export const HEAVY_6AXIS: RobotDefinition = {
  id: 'heavy-6axis',
  name: 'Heavy 6-axis',
  description: 'High-payload six-axis arm for palletized heavy workpieces.',
  payloadKg: 50,
  reachMeters: 2.0,
  joints: joints(
    [-200, -90, -150, -360, -120, -720].map(rad),
    [200, 135, 150, 360, 120, 720].map(rad),
  ),
  baseFrame: { id: 'base', description: 'Floor mounted with heavy base.' },
  toolFrame: { id: 'flange', description: 'Heavy-duty tool flange.' },
  dimensions: { scale: 1.6, upperArmLength: 1.4, forearmLength: 1.2 },
  visualAsset: PROCEDURAL_VISUAL_ASSET_ID,
  collisionModel: CAPSULE_COLLISION_MODEL_ID,
  controllerProfile: 'generic-position',
  vendor: { vendor: 'Fabrik3D', family: 'Educational heavy', note: 'Generic high-payload arm for education.' },
}

export const ROBOT_PROFILES: readonly RobotDefinition[] = [
  COMPACT_6AXIS,
  MEDIUM_6AXIS,
  HEAVY_6AXIS,
]

/** The catalog profile that reproduces the pre-catalog robot exactly. */
export const DEFAULT_ROBOT_ID = MEDIUM_6AXIS.id

/** Default end effector for the machining workflow (two-finger gripper). */
export const TWO_FINGER_GRIPPER: ToolDefinition = {
  id: 'two-finger-gripper',
  name: 'Two-finger gripper',
  category: 'gripper',
  massKg: 0.8,
  mount: 'iso-50',
  workingPayloadKg: 2,
  description: 'Parallel two-finger gripper for billet handling.',
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [TWO_FINGER_GRIPPER]
