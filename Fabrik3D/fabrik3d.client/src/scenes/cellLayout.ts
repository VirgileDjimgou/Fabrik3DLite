/**
 * S60 measured cell-layout calculation and validation.
 *
 * This is a pure, renderer-independent layer that turns declared equipment
 * footprints into measured cell extents, a derived floor size and a derived
 * camera framing, and then checks the layout against industrial clearances:
 * equipment bounds, robot reach, service clearance, operator corridor, fence
 * clearance, conveyor footprint, camera framing and safety zones.
 *
 * It is a *configuration aid*, never runtime truth: it reads only SI metre
 * footprints and never mutates simulation, collision, safety or telemetry
 * state. Diagnostics are reported, not thrown, so an imperfect layout never
 * blocks an existing valid cell.
 */

import type { Vector3Meters } from '../equipment/types'

export type CellEquipmentRole =
  | 'robot'
  | 'machine'
  | 'conveyor'
  | 'pallet'
  | 'fixture'
  | 'tool'
  | 'sensor'
  | 'infrastructure'
  | 'safety-zone'

/** One piece of equipment reduced to its measurable Y-up SI footprint. */
export interface CellFootprint {
  id: string
  definitionId: string
  role: CellEquipmentRole
  /** Centre in world X/Z metres. */
  center: { x: number; z: number }
  /** Full axis-aligned footprint in metres, before Y-rotation. */
  size: { x: number; z: number }
  /** Equipment height in metres (Y). */
  heightMeters: number
  /** Y-rotation in radians. Non-zero rotations expand the AABB conservatively. */
  rotationY?: number
  /** Robot reach radius in metres when this equipment is a manipulator. */
  reachMeters?: number
  /** True when the manipulator is expected to service this equipment. */
  robotService?: boolean
  /** Declared by-design overlaps (tool on a flange, pallet on a conveyor). */
  overlapTolerant?: boolean
  /** True for flat protective zones drawn on the floor. */
  floorMarking?: boolean
}

export interface CellLayoutRequirements {
  /** Free access gap required between tall equipment and a floor boundary. */
  serviceClearanceMeters: number
  /** Clear operational strip required on the operator side of the cell. */
  operatorCorridorMeters: number
  /** Minimum gap between the robot's swept envelope and a fence. */
  fenceClearanceMeters: number
  /** Extra distance beyond the strict framing distance accepted by the camera. */
  cameraMarginMeters: number
  /** Minimum margin a protective zone keeps around the equipment it contains. */
  safetyZoneMarginMeters: number
  /** Multiplier covering gripper/tool length when checking robot service reach. */
  robotReachToleranceRatio: number
  /** Extra floor drawn beyond the measured extents. */
  floorMarginMeters: number
}

export const DEFAULT_CELL_LAYOUT_REQUIREMENTS: CellLayoutRequirements = {
  serviceClearanceMeters: 1.2,
  operatorCorridorMeters: 1.5,
  fenceClearanceMeters: 0.2,
  cameraMarginMeters: 1.0,
  safetyZoneMarginMeters: 0.25,
  robotReachToleranceRatio: 1.25,
  floorMarginMeters: 1.5,
}

export interface CellLayoutDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  equipmentIds?: string[]
}

export interface CellExtents {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  depth: number
  centerX: number
  centerZ: number
  /** Tallest equipment in the measured set (metres). */
  maxHeightMeters: number
}

export interface AxisAlignedBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface SceneCameraFraming {
  position: Vector3Meters
  target: Vector3Meters
}

/** S69 derived camera views. `overview` is the single primary default. */
export type CellCameraView = 'overview' | 'operator' | 'workcell'

export type CellCameraPresets = Record<CellCameraView, SceneCameraFraming>

export interface CellLayoutInput {
  footprints: readonly CellFootprint[]
  requirements?: Partial<CellLayoutRequirements>
}

export interface CellLayoutValidationInput extends CellLayoutInput {
  floorSizeMeters?: { x: number; z: number }
  camera?: SceneCameraFraming
}

export interface CellLayoutResult {
  requirements: CellLayoutRequirements
  extents: CellExtents
  floorSizeMeters: { x: number; z: number }
  /** Primary default framing (equal to `cameras.overview`). */
  camera: SceneCameraFraming
  /** S69 derived overview / operator / workcell views. */
  cameras: CellCameraPresets
  diagnostics: CellLayoutDiagnostic[]
}

const EPSILON = 1e-6

/** Renderer perspective values used to verify that a camera really contains the cell. */
export const DEFAULT_CAMERA_FOV_DEGREES = 50
export const DEFAULT_CAMERA_ASPECT_RATIO = 16 / 9
const CAMERA_NEAR_METERS = 0.1
/**
 * The camera position is rounded to millimetres for deterministic data. The
 * rounding can shorten the vector by up to ~1.5 mm, so the derived distance adds
 * this allowance to keep the rounded camera inside the strict framing distance.
 */
const CAMERA_ROUNDING_ALLOWANCE_METERS = 0.01

/** Conservative AABB for a footprint, expanding for any Y-rotation. */
export function footprintBounds(footprint: CellFootprint): AxisAlignedBounds {
  const angle = footprint.rotationY ?? 0
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const halfX = (footprint.size.x * cos + footprint.size.z * sin) / 2
  const halfZ = (footprint.size.x * sin + footprint.size.z * cos) / 2
  return {
    minX: footprint.center.x - halfX,
    maxX: footprint.center.x + halfX,
    minZ: footprint.center.z - halfZ,
    maxZ: footprint.center.z + halfZ,
  }
}

/** Distance from a point to an AABB (zero when the point is inside). */
export function distanceToBounds(px: number, pz: number, bounds: AxisAlignedBounds): number {
  const dx = Math.max(bounds.minX - px, 0, px - bounds.maxX)
  const dz = Math.max(bounds.minZ - pz, 0, pz - bounds.maxZ)
  return Math.hypot(dx, dz)
}

function overlapArea(a: AxisAlignedBounds, b: AxisAlignedBounds): number {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const depth = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
  return width > 0 && depth > 0 ? width * depth : 0
}

/**
 * Measured cell extents. Robot reach envelopes are expanded into the box so
 * floor and camera framing account for the swept area, not just the chassis.
 */
export function computeCellExtents(footprints: readonly CellFootprint[]): CellExtents {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let maxHeightMeters = 0
  for (const footprint of footprints) {
    const bounds = footprintBounds(footprint)
    if (footprint.reachMeters !== undefined) {
      minX = Math.min(minX, footprint.center.x - footprint.reachMeters)
      maxX = Math.max(maxX, footprint.center.x + footprint.reachMeters)
      minZ = Math.min(minZ, footprint.center.z - footprint.reachMeters)
      maxZ = Math.max(maxZ, footprint.center.z + footprint.reachMeters)
    }
    minX = Math.min(minX, bounds.minX)
    maxX = Math.max(maxX, bounds.maxX)
    minZ = Math.min(minZ, bounds.minZ)
    maxZ = Math.max(maxZ, bounds.maxZ)
    maxHeightMeters = Math.max(maxHeightMeters, footprint.heightMeters)
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, depth: 0, centerX: 0, centerZ: 0, maxHeightMeters: 0 }
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    maxHeightMeters,
  }
}

function roundUp(value: number, step: number): number {
  return Math.ceil((value - EPSILON) / step) * step
}

/**
 * Floor size derived from measured extents. The floor stays centred on the
 * world origin (the equipment base frame) and is rounded up to a stable
 * 0.5 m manufacturing increment.
 */
export function deriveFloorSizeMeters(extents: CellExtents, marginMeters: number): { x: number; z: number } {
  const halfX = Math.max(Math.abs(extents.minX), Math.abs(extents.maxX)) + marginMeters
  const halfZ = Math.max(Math.abs(extents.minZ), Math.abs(extents.maxZ)) + marginMeters
  return { x: Math.max(4, roundUp(halfX * 2, 0.5)), z: Math.max(4, roundUp(halfZ * 2, 0.5)) }
}

/** Strict camera distance required to frame the measured extents. */
export function framingDistanceMeters(extents: CellExtents, cameraMarginMeters = 1): number {
  const span = Math.max(extents.width, extents.depth, extents.maxHeightMeters * 1.25)
  return span * 1.1 + cameraMarginMeters
}

export interface CameraDerivationOptions {
  /** View direction from target to camera (arbitrary length). */
  direction?: Vector3Meters
  cameraMarginMeters?: number
  /** Vertical fraction of the tallest equipment used as the look-at height. */
  targetHeightRatio?: number
  /** Explicit look-at height in metres; overrides `targetHeightRatio`. */
  targetHeightMeters?: number
}

export interface CameraContainmentOptions {
  fovDegrees?: number
  aspectRatio?: number
  nearMeters?: number
}

export interface CameraContainmentResult {
  contains: boolean
  minDepthMeters: number
  maxAbsNdcX: number
  maxAbsNdcY: number
}

function normalized(value: Vector3Meters): Vector3Meters {
  const length = Math.hypot(value.x, value.y, value.z) || 1
  return { x: value.x / length, y: value.y / length, z: value.z / length }
}

/** The eight Y-up corners of the measured extents box. */
function extentsCorners(extents: CellExtents): Vector3Meters[] {
  const top = Math.max(extents.maxHeightMeters, 0.01)
  const corners: Vector3Meters[] = []
  for (const x of [extents.minX, extents.maxX]) {
    for (const y of [0, top]) {
      for (const z of [extents.minZ, extents.maxZ]) corners.push({ x, y, z })
    }
  }
  return corners
}

/**
 * Camera basis (right, up) in world space for a unit forward direction
 * (camera → target). `right = normalize(cross(worldUp, forward))`,
 * `up = cross(right, forward)`.
 */
function cameraBasis(forward: Vector3Meters): { right: Vector3Meters; up: Vector3Meters } {
  const rightLength = Math.hypot(forward.z, forward.x) || 1
  const right = { x: forward.z / rightLength, y: 0, z: -forward.x / rightLength }
  // up = cross(forward, right) so it points upward for a Y-up world.
  const up = {
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  }
  return { right, up }
}

/**
 * S69: strict distance needed so every corner of the measured box stays inside a
 * perspective frustum looking from `target` towards the camera along `direction`.
 * This is the geometrically correct framing distance, accounting for the
 * renderer's vertical FOV and viewport aspect ratio.
 */
export function framingDistanceForContainment(
  extents: CellExtents,
  direction: Vector3Meters,
  target: Vector3Meters,
  options: CameraContainmentOptions = {},
): number {
  const unit = normalized(direction)
  const fov = options.fovDegrees ?? DEFAULT_CAMERA_FOV_DEGREES
  const aspect = options.aspectRatio ?? DEFAULT_CAMERA_ASPECT_RATIO
  const tanHalf = Math.tan((fov * Math.PI) / 360)
  const { right, up } = cameraBasis({ x: -unit.x, y: -unit.y, z: -unit.z })
  let required = 0
  for (const corner of extentsCorners(extents)) {
    const v = { x: corner.x - target.x, y: corner.y - target.y, z: corner.z - target.z }
    const along = v.x * unit.x + v.y * unit.y + v.z * unit.z
    const rx = v.x * right.x + v.y * right.y + v.z * right.z
    const ry = v.x * up.x + v.y * up.y + v.z * up.z
    const needed = along + Math.max(Math.abs(rx) / (tanHalf * aspect), Math.abs(ry) / tanHalf)
    required = Math.max(required, needed)
  }
  return Math.max(0, required)
}

/**
 * Deterministic test that a camera frame contains the measured cell bounds. It
 * projects the eight extents corners into normalized device coordinates using
 * the renderer's perspective parameters.
 */
export function cameraContainsExtents(
  camera: SceneCameraFraming,
  extents: CellExtents,
  options: CameraContainmentOptions = {},
): CameraContainmentResult {
  const fov = options.fovDegrees ?? DEFAULT_CAMERA_FOV_DEGREES
  const aspect = options.aspectRatio ?? DEFAULT_CAMERA_ASPECT_RATIO
  const near = options.nearMeters ?? CAMERA_NEAR_METERS
  const tanHalf = Math.tan((fov * Math.PI) / 360)
  const forward = normalized({
    x: camera.target.x - camera.position.x,
    y: camera.target.y - camera.position.y,
    z: camera.target.z - camera.position.z,
  })
  const { right, up } = cameraBasis(forward)
  let contains = true
  let minDepthMeters = Number.POSITIVE_INFINITY
  let maxAbsNdcX = 0
  let maxAbsNdcY = 0
  for (const corner of extentsCorners(extents)) {
    const v = { x: corner.x - camera.position.x, y: corner.y - camera.position.y, z: corner.z - camera.position.z }
    const depth = v.x * forward.x + v.y * forward.y + v.z * forward.z
    minDepthMeters = Math.min(minDepthMeters, depth)
    if (!(depth > near)) { contains = false; continue }
    const ndcX = (v.x * right.x + v.y * right.y + v.z * right.z) / (depth * tanHalf * aspect)
    const ndcY = (v.x * up.x + v.y * up.y + v.z * up.z) / (depth * tanHalf)
    maxAbsNdcX = Math.max(maxAbsNdcX, Math.abs(ndcX))
    maxAbsNdcY = Math.max(maxAbsNdcY, Math.abs(ndcY))
    if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) contains = false
  }
  if (!Number.isFinite(minDepthMeters)) minDepthMeters = 0
  return { contains, minDepthMeters, maxAbsNdcX, maxAbsNdcY }
}

/**
 * Camera framing derived from measured extents. The direction is preserved
 * (default three-quarter industrial view) and the distance is the strict
 * framing distance, so the cell always fits the viewport even after rounding.
 */
export function deriveCameraPreset(extents: CellExtents, options: CameraDerivationOptions = {}): SceneCameraFraming {
  const direction = normalized(options.direction ?? { x: 0.55, y: 0.5, z: 0.67 })
  const margin = options.cameraMarginMeters ?? 1
  const target: Vector3Meters = {
    x: round3(extents.centerX),
    y: round3(options.targetHeightMeters ?? Math.max(extents.maxHeightMeters * (options.targetHeightRatio ?? 0.45), 0.6)),
    z: round3(extents.centerZ),
  }
  const distance = Math.max(
    framingDistanceMeters(extents, margin),
    framingDistanceForContainment(extents, direction, target),
  ) + margin + CAMERA_ROUNDING_ALLOWANCE_METERS
  return {
    position: {
      x: round3(target.x + direction.x * distance),
      y: round3(target.y + direction.y * distance),
      z: round3(target.z + direction.z * distance),
    },
    target,
  }
}

/**
 * S69: derives the three camera views from the same measured extents.
 *
 * - `overview` is the primary default and contains the full measured bounds.
 * - `operator` looks in from the +Z operator side at eye height.
 * - `workcell` focuses on the robot and its working area (a closer shot).
 *
 * All three are pure functions of the extents and declared footprints and are
 * therefore deterministic; no render frame, mesh or runtime state is read.
 */
export function deriveCameraPresets(
  extents: CellExtents,
  footprints: readonly CellFootprint[] = [],
  options: CameraDerivationOptions = {},
): CellCameraPresets {
  const margin = options.cameraMarginMeters ?? 1
  const overview = deriveCameraPreset(extents, options)
  const operator = deriveCameraPreset(extents, {
    ...options,
    direction: { x: 0.1, y: 0.34, z: 0.94 },
    targetHeightMeters: round3(Math.min(Math.max(extents.maxHeightMeters * 0.7, 0.9), 1.7)),
  })
  const robot = footprints.find((footprint) => footprint.role === 'robot')
  const focusX = robot?.center.x ?? extents.centerX
  const focusZ = robot?.center.z ?? extents.centerZ
  const focusRadius = Math.max(robot?.reachMeters ?? 0, 1.5)
  const workcell = deriveCameraPreset({
    minX: focusX - focusRadius,
    maxX: focusX + focusRadius,
    minZ: focusZ - focusRadius,
    maxZ: focusZ + focusRadius,
    width: focusRadius * 2,
    depth: focusRadius * 2,
    centerX: focusX,
    centerZ: focusZ,
    maxHeightMeters: extents.maxHeightMeters,
  }, {
    cameraMarginMeters: margin,
    direction: { x: 0.72, y: 0.52, z: 0.46 },
    targetHeightMeters: round3(Math.min(Math.max(extents.maxHeightMeters * 0.45, 0.7), 1.4)),
  })
  return { overview, operator, workcell }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function requirements(input: CellLayoutInput): CellLayoutRequirements {
  return { ...DEFAULT_CELL_LAYOUT_REQUIREMENTS, ...(input.requirements ?? {}) }
}

/**
 * Validates a measured layout. Diagnostics are advisory and never throw; an
 * invalid cell still loads and simulates.
 */
export function validateCellLayout(input: CellLayoutValidationInput): CellLayoutDiagnostic[] {
  const config = requirements(input)
  const diagnostics: CellLayoutDiagnostic[] = []
  const error = (code: string, message: string, equipmentIds?: string[]) =>
    diagnostics.push({ severity: 'error', code, message, equipmentIds })
  const warning = (code: string, message: string, equipmentIds?: string[]) =>
    diagnostics.push({ severity: 'warning', code, message, equipmentIds })

  const bounds = input.footprints.map((footprint) => ({ footprint, bounds: footprintBounds(footprint) }))
  const extents = computeCellExtents(input.footprints)

  // 1. Equipment bounds stay inside the declared floor.
  if (input.floorSizeMeters) {
    const halfX = input.floorSizeMeters.x / 2
    const halfZ = input.floorSizeMeters.z / 2
    for (const { footprint, bounds: box } of bounds) {
      if (box.minX < -halfX - EPSILON || box.maxX > halfX + EPSILON || box.minZ < -halfZ - EPSILON || box.maxZ > halfZ + EPSILON) {
        error('equipment-outside-floor', `Equipment '${footprint.id}' extends beyond the ${input.floorSizeMeters.x}x${input.floorSizeMeters.z} m floor.`, [footprint.id])
      }
    }
  }

  // 2. Gross equipment overlap (excluding declared by-design overlaps).
  for (let i = 0; i < input.footprints.length; i += 1) {
    for (let j = i + 1; j < input.footprints.length; j += 1) {
      const a = bounds[i]!
      const b = bounds[j]!
      if (a.footprint.floorMarking || b.footprint.floorMarking) continue
      if (a.footprint.overlapTolerant || b.footprint.overlapTolerant) continue
      if (allowedOverlap(a.footprint, b.footprint)) continue
      const area = overlapArea(a.bounds, b.bounds)
      if (area > 0.05) {
        error('equipment-overlap', `Equipment '${a.footprint.id}' and '${b.footprint.id}' overlap by ${area.toFixed(2)} m2.`, [a.footprint.id, b.footprint.id])
      }
    }
  }

  for (const robot of input.footprints.filter((footprint) => footprint.role === 'robot')) {
    const robotBounds = footprintBounds(robot)

    // 3. Robot reach: service equipment must be within the rated envelope.
    if (robot.reachMeters !== undefined) {
      const serviceable = input.footprints.filter((footprint) => footprint.robotService && footprint.id !== robot.id)
      for (const target of serviceable) {
        const distance = distanceToBounds(robot.center.x, robot.center.z, footprintBounds(target))
        const limit = robot.reachMeters * config.robotReachToleranceRatio
        if (distance > limit) {
          warning('robot-unreachable', `Robot '${robot.id}' cannot service '${target.id}' (${distance.toFixed(2)} m > ${limit.toFixed(2)} m reach).`, [robot.id, target.id])
        }
      }

      // 6. Fence clearance: guarding stays outside the swept envelope.
      for (const fence of input.footprints.filter((footprint) => footprint.definitionId.includes('fence'))) {
        const distance = distanceToBounds(robot.center.x, robot.center.z, footprintBounds(fence))
        const required = robot.reachMeters + config.fenceClearanceMeters
        if (distance < required - EPSILON) {
          warning('fence-clearance', `Fence '${fence.id}' is ${distance.toFixed(2)} m from robot '${robot.id}'; ${required.toFixed(2)} m requires clearance outside the reach envelope.`, [robot.id, fence.id])
        }
      }

      // 9. Safety zones must be able to contain the robot's swept envelope.
      for (const zone of input.footprints.filter((footprint) => footprint.role === 'safety-zone')) {
        const zoneBounds = footprintBounds(zone)
        if (overlapArea(zoneBounds, robotBounds) > 0) {
          const zoneSpan = Math.min(zoneBounds.maxX - zoneBounds.minX, zoneBounds.maxZ - zoneBounds.minZ)
          if (zoneSpan < robot.reachMeters * 2) {
            warning('safety-zone-too-small', `Safety zone '${zone.id}' is smaller than the ${(robot.reachMeters * 2).toFixed(2)} m robot swept envelope.`, [zone.id, robot.id])
          }
        }
      }
    }
  }

  if (input.floorSizeMeters) {
    const halfX = input.floorSizeMeters.x / 2
    const halfZ = input.floorSizeMeters.z / 2

    // 4. Service clearance: tall equipment keeps one accessible side.
    for (const { footprint, bounds: box } of bounds) {
      if (footprint.floorMarking || footprint.heightMeters < 1.2) continue
      const gaps = [box.minX + halfX, halfX - box.maxX, box.minZ + halfZ, halfZ - box.maxZ]
      const best = Math.max(...gaps)
      if (best < config.serviceClearanceMeters - EPSILON) {
        warning('service-clearance', `Equipment '${footprint.id}' has only ${best.toFixed(2)} m service clearance (${config.serviceClearanceMeters} m required).`, [footprint.id])
      }
    }

    // 5. Operator corridor on the +Z (front) side of the cell.
    const frontEquipment = bounds.filter((entry) => !entry.footprint.floorMarking)
    const frontMost = frontEquipment.reduce((value, entry) => Math.max(value, entry.bounds.maxZ), Number.NEGATIVE_INFINITY)
    if (Number.isFinite(frontMost)) {
      const corridor = halfZ - frontMost
      if (corridor < config.operatorCorridorMeters - EPSILON) {
        warning('operator-corridor', `Operator corridor in front of the cell is ${corridor.toFixed(2)} m (${config.operatorCorridorMeters} m required).`)
      }
    }

    // 7. Conveyor footprint including infeed/outfeed access stays inside the floor.
    for (const { footprint, bounds: box } of bounds.filter((entry) => entry.footprint.role === 'conveyor')) {
      const alongX = footprint.size.x >= footprint.size.z
      const minX = box.minX - (alongX ? config.serviceClearanceMeters : 0)
      const maxX = box.maxX + (alongX ? config.serviceClearanceMeters : 0)
      const minZ = box.minZ - (alongX ? 0 : config.serviceClearanceMeters)
      const maxZ = box.maxZ + (alongX ? 0 : config.serviceClearanceMeters)
      if (minX < -halfX - EPSILON || maxX > halfX + EPSILON || minZ < -halfZ - EPSILON || maxZ > halfZ + EPSILON) {
        warning('conveyor-footprint', `Conveyor '${footprint.id}' infeed/outfeed access extends beyond the floor.`, [footprint.id])
      }
    }

    // 9. Protective zones stay on the floor and keep a margin around equipment.
    for (const { footprint, bounds: box } of bounds.filter((entry) => entry.footprint.role === 'safety-zone')) {
      if (box.minX < -halfX - EPSILON || box.maxX > halfX + EPSILON || box.minZ < -halfZ - EPSILON || box.maxZ > halfZ + EPSILON) {
        warning('safety-zone-outside-floor', `Safety zone '${footprint.id}' extends beyond the floor.`, [footprint.id])
      }
    }
  }

  // 8. Camera framing covers the measured extents.
  if (input.camera) {
    const distance = Math.hypot(
      input.camera.position.x - input.camera.target.x,
      input.camera.position.y - input.camera.target.y,
      input.camera.position.z - input.camera.target.z,
    )
    const required = framingDistanceMeters(extents, config.cameraMarginMeters)
    if (distance < required - EPSILON) {
      warning('camera-framing', `Camera distance ${distance.toFixed(2)} m cannot frame the measured cell (${required.toFixed(2)} m required).`)
    }
    const target = input.camera.target
    const outside = target.x < extents.minX - config.cameraMarginMeters || target.x > extents.maxX + config.cameraMarginMeters
      || target.z < extents.minZ - config.cameraMarginMeters || target.z > extents.maxZ + config.cameraMarginMeters
    if (outside) warning('camera-target-outside', 'Camera target lies outside the measured cell extents.')

    // 10. Strict frustum containment: every measured corner must project inside the viewport.
    const containment = cameraContainsExtents(input.camera, extents)
    if (!containment.contains) {
      warning('camera-clipping', `Camera frame clips the measured cell bounds (max |NDCx| ${containment.maxAbsNdcX.toFixed(2)}, max |NDCy| ${containment.maxAbsNdcY.toFixed(2)}).`)
    }
  }

  return diagnostics
}

/** Full measured layout: extents, derived floor/cameras and validation diagnostics. */
export function resolveCellLayout(input: CellLayoutValidationInput): CellLayoutResult {
  const config = requirements(input)
  const extents = computeCellExtents(input.footprints)
  const floorSizeMeters = input.floorSizeMeters ?? deriveFloorSizeMeters(extents, config.floorMarginMeters)
  const cameras = deriveCameraPresets(extents, input.footprints, { cameraMarginMeters: config.cameraMarginMeters })
  const camera = input.camera ?? cameras.overview
  const diagnostics = validateCellLayout({ footprints: input.footprints, requirements: config, floorSizeMeters, camera })
  return { requirements: config, extents, floorSizeMeters, camera, cameras, diagnostics }
}

/** Roles that may legitimately overlap (stacking, gantries, tools on flanges). */
function allowedOverlap(a: CellFootprint, b: CellFootprint): boolean {
  const roles = new Set<CellEquipmentRole>([a.role, b.role])
  if (roles.has('tool') || roles.has('sensor')) return true
  if (roles.has('pallet') && (roles.has('conveyor') || roles.has('machine') || roles.has('pallet') || roles.has('fixture'))) return true
  if (roles.has('conveyor') && roles.has('machine')) return true
  return false
}
