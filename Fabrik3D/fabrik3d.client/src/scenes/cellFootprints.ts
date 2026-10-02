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
import type { CellEquipmentRole, CellFootprint } from './cellLayout'

/**
 * Declared footprints for classes whose authoritative definition deliberately
 * has no `dimensionsMeters`. Values match the analytic collision proxies
 * (hero CNC body) and the documented visual envelope.
 */
const FOOTPRINT_OVERRIDES: Readonly<Record<string, Vector3Meters>> = {
  'educational-cnc': { x: 2.0, y: 2.2, z: 1.6 },
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
 * Rated reach used for layout validation. The material-flow `fanuc-like-6axis`
 * class is a generic training manipulator; 1.6 m is its documented service
 * envelope (chassis reach plus a standard gripper). It is a layout input, never
 * a kinematics authority.
 */
const ROBOT_REACH_METERS: Readonly<Record<string, number>> = {
  'fanuc-like-6axis': 1.6,
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
  return cell.equipment.map((equipment) => {
    const dimensions = dimensionsForDefinition(equipment.definitionId)
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
    if (role === 'robot') footprint.reachMeters = ROBOT_REACH_METERS[equipment.definitionId]
    if (ROBOT_SERVICE_DEFINITIONS.has(equipment.definitionId)) footprint.robotService = true
    if (role === 'tool' || role === 'sensor') footprint.overlapTolerant = true
    if (OVERLAP_TOLERANT_DEFINITIONS.has(equipment.definitionId)) footprint.overlapTolerant = true
    if (role === 'safety-zone') footprint.floorMarking = true
    return footprint
  })
}
