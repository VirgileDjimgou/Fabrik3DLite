/**
 * S60 adapter from declarative `CellDefinition` data to measurable
 * `CellFootprint`s. It reuses the equipment SDK dimensions and the shared
 * procedural visual dimensions so the layout layer never maintains a second
 * copy of equipment sizes.
 *
 * Only declared data is read; no mesh is inspected and no runtime state is
 * touched.
 */

import { SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS } from '../equipment/fixtures/singleConveyorCell'
import { MATERIAL_FLOW_EQUIPMENT_DEFINITIONS } from '../equipment/materialFlow'
import type { CellDefinition, Vector3Meters } from '../equipment/types'
import { dimensionsFor } from '../equipment/visuals/materialFlowVisuals'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { createSafetyRobotModel } from '../safety/robotModel'
import { cellKindForCellId } from '../scenarios/cellComposition'
import { createScenarioMotionPlan } from '../scenarios/scenarioRobotMotion'
import type { CellEquipmentRole, CellFootprint } from './cellLayout'

/**
 * Declared footprints for classes whose authoritative definition deliberately
 * has no `dimensionsMeters`. Values match the analytic collision proxies
 * (hero CNC body) and the documented visual envelope.
 */
const FOOTPRINT_OVERRIDES: Readonly<Record<string, Vector3Meters>> = {
  'educational-cnc': { x: 2.0, y: 2.2, z: 1.6 },
}

/**
 * S69 per-cell, per-instance footprint corrections. The shared `safety-zone`
 * class is a genuine protective marking; the CNC reference cell declares one
 * large enough to contain the robot's swept envelope, while the smaller
 * material-flow zone marking keeps its declared class size.
 */
const CELL_FOOTPRINT_OVERRIDES: Readonly<Record<string, Readonly<Record<string, Vector3Meters>>>> = {
  'single-conveyor-machining-cell': {
    'safety-zone-1': { x: 7.6, y: 0.02, z: 7.6 },
  },
}

const DIMENSIONS_BY_DEFINITION: ReadonlyMap<string, Vector3Meters> = new Map(
  [...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS, ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS]
    .filter((definition) => definition.dimensionsMeters)
    .map((definition) => [definition.id, definition.dimensionsMeters!]),
)

const ROBOT_DEFINITIONS = new Set(['fanuc-like-6axis', 'compact-6axis', 'medium-6axis', 'heavy-6axis'])
const MACHINE_DEFINITIONS = new Set([
  'educational-cnc', 'vision-inspection-station', 'machining-fixture', 'workholding-adapter',
  'three-jaw-chuck', 'toggle-clamp', 'pneumatic-stop',
])
const CONVEYOR_DEFINITIONS = new Set([
  'straight-conveyor', 'curved-conveyor', 'roller-transfer', 'belt-conveyor', 'diverter-pusher',
])
const PALLET_DEFINITIONS = new Set([
  'euro-pallet', 'carton', 'configurable-part', 'pallet-station', 'pallet-nest',
  'storage-bin', 'parts-rack', 'infeed-buffer', 'outfeed-buffer',
])
const TOOL_DEFINITIONS = new Set(['two-finger-gripper', 'vacuum-gripper', 'iso-flange-tcp', 'tool-changer', 'tool-rack'])
const SENSOR_DEFINITIONS = new Set(['photoelectric-sensor', 'barcode-rfid-reader', 'part-presence-sensor', 'grip-pressure-sensor'])
const SAFETY_ZONE_DEFINITIONS = new Set(['safety-zone'])
/** Guarding components that mount onto a fence and legitimately overlap it. */
const OVERLAP_TOLERANT_DEFINITIONS = new Set(['light-curtain', 'interlocked-gate', 'workholding-adapter'])

/** Classes the manipulator is expected to service during a scenario. */
const ROBOT_SERVICE_DEFINITIONS = new Set([
  'straight-conveyor', 'curved-conveyor', 'roller-transfer', 'belt-conveyor',
  'educational-cnc', 'pallet-station', 'euro-pallet', 'machining-fixture',
  'workholding-adapter', 'configurable-part', 'carton', 'storage-bin',
])

/**
 * S69: the layout robot reach is derived from the same authoritative
 * `SafetyRobotModel` envelope the runtime reachability checks use, resolved from
 * the robot profile the cell's scenario motion plan selects. This removes the
 * previous hardcoded 1.6 m value, which understated the physical arm and made a
 * reachable cell look unreachable. It remains a layout input and never becomes
 * a kinematics authority.
 */
const ROBOT_REACH_BY_PROFILE = new Map<string, number>()

/** Catalog robot profile the cell's scenario motion plan drives (CNC falls back to the default profile). */
export function robotProfileIdForCell(cellId: string): string {
  return createScenarioMotionPlan(cellKindForCellId(cellId)).robotProfileId
}

/** Authoritative reach envelope (metres) of a catalog robot profile, from the shared safety model. */
export function robotReachMetersForProfile(profileId: string): number {
  const cached = ROBOT_REACH_BY_PROFILE.get(profileId)
  if (cached !== undefined) return cached
  const robot = createDefaultRobotCatalog().getRobot(profileId)
  const reach = createSafetyRobotModel(robot).maxReachMeters()
  ROBOT_REACH_BY_PROFILE.set(profileId, reach)
  return reach
}

export function roleForDefinition(definitionId: string): CellEquipmentRole {
  if (ROBOT_DEFINITIONS.has(definitionId)) return 'robot'
  if (SAFETY_ZONE_DEFINITIONS.has(definitionId)) return 'safety-zone'
  if (CONVEYOR_DEFINITIONS.has(definitionId)) return 'conveyor'
  if (MACHINE_DEFINITIONS.has(definitionId)) return 'machine'
  if (TOOL_DEFINITIONS.has(definitionId)) return 'tool'
  if (SENSOR_DEFINITIONS.has(definitionId)) return 'sensor'
  if (PALLET_DEFINITIONS.has(definitionId)) return 'pallet'
  return 'infrastructure'
}

/** Declared Y-up SI dimensions for an equipment class (metres). */
export function dimensionsForDefinition(definitionId: string): Vector3Meters {
  return FOOTPRINT_OVERRIDES[definitionId] ?? DIMENSIONS_BY_DEFINITION.get(definitionId) ?? dimensionsFor(definitionId)
}

/** Converts a declarative cell definition into measured layout footprints. */
export function cellFootprints(cell: CellDefinition): CellFootprint[] {
  const robotReachMeters = robotReachMetersForProfile(robotProfileIdForCell(cell.id))
  const cellOverrides = CELL_FOOTPRINT_OVERRIDES[cell.id]
  return cell.equipment.map((equipment) => {
    const dimensions = cellOverrides?.[equipment.id] ?? dimensionsForDefinition(equipment.definitionId)
    const role = roleForDefinition(equipment.definitionId)
    const footprint: CellFootprint = {
      id: equipment.id,
      definitionId: equipment.definitionId,
      role,
      center: { x: equipment.transform.position.x, z: equipment.transform.position.z },
      size: { x: dimensions.x, z: dimensions.z },
      heightMeters: dimensions.y,
      rotationY: equipment.transform.rotation.y,
    }
    if (role === 'robot') footprint.reachMeters = robotReachMeters
    if (ROBOT_SERVICE_DEFINITIONS.has(equipment.definitionId)) footprint.robotService = true
    if (role === 'tool' || role === 'sensor') footprint.overlapTolerant = true
    if (OVERLAP_TOLERANT_DEFINITIONS.has(equipment.definitionId)) footprint.overlapTolerant = true
    if (role === 'safety-zone') footprint.floorMarking = true
    return footprint
  })
}
