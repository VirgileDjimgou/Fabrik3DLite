/**
 * Simplified robot collision model built from the visual robot linkage,
 * independent from any rendered mesh.
 *
 * The FK here reproduces the `IndustrialRobot` joint hierarchy (base
 * rotation about Y, then Z/Z/X/Z/X) in the cell frame (X right, Y up,
 * Z forward). All lengths are meters.
 */

import type { RobotDefinition } from '../robot/catalog'
import { toJointLimits } from '../robot/catalog'
import type { JointLimit } from '../simulation/AxisLimits'
import { capsuleIntersectsCapsule, COLLISION_EPSILON_METERS, distance, type CollisionPrimitive, type Vec3 } from './collision'

/** Default link radius used for the simplified arm capsules (meters). */
export const DEFAULT_LINK_RADIUS_METERS = 0.09

/** Default tool radius (gripper) used for the simplified tool capsule (meters). */
export const DEFAULT_TOOL_RADIUS_METERS = 0.05

/** Tool length from the flange to the gripper tip (meters). */
export const DEFAULT_TOOL_LENGTH_METERS = 0.14

type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]

const I: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function rotX(a: number): Mat4 {
  const c = Math.cos(a); const s = Math.sin(a)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
}

function rotY(a: number): Mat4 {
  const c = Math.cos(a); const s = Math.sin(a)
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]
}

function rotZ(a: number): Mat4 {
  const c = Math.cos(a); const s = Math.sin(a)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function translate(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const out = Array.from({ length: 16 }, () => 0)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[row * 4 + col] = a[row * 4]! * b[col]! + a[row * 4 + 1]! * b[4 + col]! + a[row * 4 + 2]! * b[8 + col]! + a[row * 4 + 3]! * b[12 + col]!
    }
  }
  return out as Mat4
}

function origin(m: Mat4): Vec3 { return { x: m[3], y: m[7], z: m[11] } }

/** Robot model used by safety checks; its FK matches the visual linkage. */
export interface SafetyRobotModel {
  readonly id: string
  readonly jointLimits: readonly JointLimit[]
  /** Maximum reach from the base to the flange, in meters. */
  maxReachMeters(): number
  /** Joint origins along the arm: base … flange … tool tip, in the cell frame. */
  jointOrigins(jointsRad: readonly number[]): Vec3[]
  /** Tool pose (position only) for the given joints, in the cell frame. */
  toolPosition(jointsRad: readonly number[]): Vec3
}

export interface RobotDimensionsLike {
  scale?: number
  baseHeight?: number
  shoulderHeight?: number
  upperArmLength?: number
  forearmLength?: number
  wristLength?: number
}

/** Builds a Y-up safety model from the catalog robot definition. */
export function createSafetyRobotModel(robot: RobotDefinition): SafetyRobotModel {
  const d = robot.dimensions
  const scale = d.scale ?? 1
  const baseHeight = (d.baseHeight ?? 0.4) * scale
  const shoulderHeight = (d.shoulderHeight ?? 0.4) * scale
  const upperArm = (d.upperArmLength ?? 0.9) * scale
  const forearm = (d.forearmLength ?? 0.76) * scale
  const wrist = (d.wristLength ?? 0.1) * scale
  const maxReach = baseHeight + shoulderHeight + upperArm + forearm + wrist

  function jointOrigins(jointsRad: readonly number[]): Vec3[] {
    const origins: Vec3[] = [origin(I)]
    let m: Mat4 = mul(translate(0, baseHeight, 0), rotY(jointsRad[0] ?? 0))
    origins.push(origin(m))
    m = mul(m, mul(translate(0, shoulderHeight, 0), rotZ(jointsRad[1] ?? 0)))
    origins.push(origin(m))
    m = mul(m, mul(translate(0, upperArm, 0), rotZ(jointsRad[2] ?? 0)))
    origins.push(origin(m))
    m = mul(m, mul(translate(0, forearm, 0), rotX(jointsRad[3] ?? 0)))
    origins.push(origin(m))
    m = mul(m, rotZ(jointsRad[4] ?? 0))
    origins.push(origin(m))
    m = mul(m, mul(translate(0, wrist, 0), rotX(jointsRad[5] ?? 0)))
    origins.push(origin(m)) // flange
    m = mul(m, translate(0, DEFAULT_TOOL_LENGTH_METERS, 0))
    origins.push(origin(m)) // tool tip
    return origins
  }

  return {
    id: robot.id,
    jointLimits: toJointLimits(robot.joints),
    maxReachMeters: () => maxReach,
    jointOrigins,
    toolPosition: (jointsRad) => jointOrigins(jointsRad)[jointOrigins(jointsRad).length - 1]!,
  }
}

export interface RobotArmSegments {
  /** One capsule per arm link, from the base up to the flange. */
  links: CollisionPrimitive[]
  /** Tool capsule from the flange to the tool tip. */
  tool: CollisionPrimitive
  /** Joint origins used to build the segments (base … flange … tool tip). */
  origins: Vec3[]
}

/** Builds capsule segments along the arm from the safety model. */
export function buildRobotArmSegments(
  model: SafetyRobotModel,
  jointsRad: readonly number[],
  linkRadiusMeters = DEFAULT_LINK_RADIUS_METERS,
  toolRadiusMeters = DEFAULT_TOOL_RADIUS_METERS,
): RobotArmSegments {
  const origins = model.jointOrigins(jointsRad)
  const links: CollisionPrimitive[] = []
  for (let index = 0; index < origins.length - 2; index++) {
    links.push({ kind: 'capsule', start: origins[index]!, end: origins[index + 1]!, radius: linkRadiusMeters })
  }
  const flange = origins[origins.length - 2]!
  const toolTip = origins[origins.length - 1]!
  const tool: CollisionPrimitive = { kind: 'capsule', start: flange, end: toolTip, radius: toolRadiusMeters }
  return { links, tool, origins }
}

export interface SelfCollisionResult {
  collision: boolean
  indexA: number | null
  indexB: number | null
  distanceMeters: number
}

/**
 * Checks self-collision between non-adjacent arm links. Adjacent links
 * always touch, so they are excluded, as are links connected through a
 * zero-length intermediate joint (they share an origin and always touch).
 * A small positive margin is a self-clearance.
 */
export function selfCollision(links: CollisionPrimitive[], marginMeters = 0): SelfCollisionResult {
  const asCapsule = (link: CollisionPrimitive) => link as { start: Vec3; end: Vec3; radius: number }
  for (let a = 0; a < links.length; a++) {
    for (let b = a + 2; b < links.length; b++) {
      const capsuleA = asCapsule(links[a]!)
      const capsuleB = asCapsule(links[b]!)
      // Links joined through a zero-length intermediate joint share an origin.
      if (distance(capsuleA.end, capsuleB.start) <= COLLISION_EPSILON_METERS) continue
      const collisionDistance = capsuleIntersectsCapsule(capsuleA, capsuleB, COLLISION_EPSILON_METERS).distanceMeters
      if (collisionDistance < marginMeters) {
        return { collision: true, indexA: a, indexB: b, distanceMeters: collisionDistance }
      }
    }
  }
  return { collision: false, indexA: null, indexB: null, distanceMeters: Number.POSITIVE_INFINITY }
}