/**
 * Robot and tool catalog contracts.
 *
 * A `RobotDefinition` is pure data: it describes payload, reach, joint
 * limits, frames, dimensions, controller profile and asset references.
 * Every catalog robot is driven through the same generic runtime
 * controller interface (`RobotController`), so swapping a profile never
 * requires a scene rewrite.
 *
 * All lengths are meters, angles radians, masses kilograms.
 */

import type { RobotDimensions } from '../IndustrialRobot'
import type { JointLimit } from '../../simulation/AxisLimits'

/** A single revolute joint with its limits. */
export interface JointDefinition {
  /** Stable identifier, e.g. `j1`. */
  id: string
  /** Human-readable name, e.g. `Base rotation`. */
  name: string
  /** Lower limit in radians. */
  minRad: number
  /** Upper limit in radians. */
  maxRad: number
}

/** A named coordinate frame (base / tool / flange). */
export interface FrameDefinition {
  id: string
  description?: string
}

/**
 * Optional, license-safe vendor metadata used only for educational
 * comparison. It never implies OEM controller emulation.
 */
export interface VendorMetadata {
  vendor?: string
  family?: string
  /** Plain-text educational note, e.g. "generic medium-payload arm". */
  note?: string
}

export interface RobotDefinition {
  id: string
  name: string
  description?: string
  /** Nominal payload capacity in kilograms. */
  payloadKg: number
  /** Nominal reach in meters. */
  reachMeters: number
  /** Exactly six revolute joints for a six-axis profile. */
  joints: JointDefinition[]
  baseFrame: FrameDefinition
  toolFrame: FrameDefinition
  /** Procedural dimensions passed to the industrial robot builder. */
  dimensions: RobotDimensions
  /** Asset key for the procedural visual representation. */
  visualAsset: string
  /** Asset key for the collision model. */
  collisionModel: string
  /** Controller profile name; all map to the same generic controller. */
  controllerProfile: string
  vendor?: VendorMetadata
}

export type ToolCategory = 'gripper' | 'suction' | 'spindle' | 'welding-torch'

/**
 * A tool / end effector is a separate definition with compatibility
 * metadata. A tool is compatible with a robot when the robot payload
 * covers the tool mass plus the declared working payload.
 */
export interface ToolDefinition {
  id: string
  name: string
  category: ToolCategory
  /** Tool mass in kilograms. */
  massKg: number
  /** Flange mount identifier, e.g. `iso-50`. */
  mount: string
  /** Mass the tool needs to lift in addition to its own mass. */
  workingPayloadKg: number
  description?: string
}

/** Collapsed shape of a robot profile for UI display and selection. */
export interface RobotProfileSummary {
  id: string
  name: string
  payloadKg: number
  reachMeters: number
  controllerProfile: string
  vendor?: VendorMetadata
}

/** Maps a `JointDefinition[]` to the runtime `JointLimit[]` shape. */
export function toJointLimits(joints: JointDefinition[]): JointLimit[] {
  return joints.map((joint) => ({ min: joint.minRad, max: joint.maxRad }))
}
