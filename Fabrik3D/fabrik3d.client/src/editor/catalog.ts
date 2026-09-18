/**
 * Equipment catalog used by the visual cell editor. Bounds mirror the
 * rendered geometry (documented simplified footprints in the plan view).
 */

import { SINGLE_CELL_CONVEYOR } from '../simulation/SingleConveyorCellLayout'
import type { RobotCatalogService } from '../robot/catalog'
import { createSafetyRobotModel } from '../safety/robotModel'
import type { CellDefinition } from '../equipment'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS } from '../safety'
import { MATERIAL_FLOW_EQUIPMENT_DEFINITIONS } from '../equipment'
import type { EditorCatalogEntry, EditorEquipmentKind, EditorPlacement } from './editorTypes'

export const ROBOT_DEFINITION_ID = 'medium-6axis'

export function createEditorCatalog(robotCatalog: RobotCatalogService): EditorCatalogEntry[] {
  const robot = robotCatalog.getRobot(ROBOT_DEFINITION_ID)
  const reachMeters = createSafetyRobotModel(robot).maxReachMeters()

  const entries: EditorCatalogEntry[] = [
    { kind: 'robot', definitionId: ROBOT_DEFINITION_ID, label: 'Robot (medium 6-axis)', width: 1.2, depth: 1.2, reachMeters, group: 'Core equipment', capability: 'simulation-ready' },
    { kind: 'cnc', definitionId: 'educational-cnc', label: 'CNC', width: 2.0, depth: 1.6, group: 'Core equipment', capability: 'simulation-ready' },
    { kind: 'conveyor', definitionId: 'belt-conveyor', label: 'Conveyor', width: SINGLE_CELL_CONVEYOR.length, depth: 0.6, group: 'Core equipment', capability: 'simulation-ready' },
    { kind: 'pallet-station', definitionId: 'pallet-station', label: 'Pallet station', width: 0.6, depth: 0.6, group: 'Core equipment', capability: 'simulation-ready' },
    { kind: 'safety-zone', definitionId: 'safety-zone', label: 'Safety zone', width: 2.0, depth: 2.0, group: 'Safety', capability: 'static' },
  ]
  for (const definition of INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS) {
    const dimensions = definition.dimensionsMeters!
    entries.push({
      kind: definition.id as EditorEquipmentKind,
      definitionId: definition.id,
      label: definition.capabilities[0]!.description,
      width: dimensions.x,
      depth: dimensions.z,
      group: definition.category === 'safety-device' ? 'Safety' : 'Infrastructure',
      capability: definition.runtimeCapability ?? 'static',
      anchorIds: definition.anchors?.map(anchor => anchor.id),
      ports: definition.ports,
    })
  }
  for (const definition of MATERIAL_FLOW_EQUIPMENT_DEFINITIONS) {
    const dimensions = definition.dimensionsMeters!
    entries.push({
      kind: definition.id as EditorEquipmentKind,
      definitionId: definition.id,
      label: definition.capabilities[0]!.description,
      width: dimensions.x,
      depth: dimensions.z,
      group: definition.category === 'tool' ? 'Tooling' : 'Material flow',
      capability: definition.runtimeCapability ?? 'static',
      anchorIds: definition.anchors?.map(anchor => anchor.id),
      ports: definition.ports,
    })
  }
  return entries
}

export function catalogEntryFor(kind: EditorEquipmentKind, catalog: EditorCatalogEntry[]): EditorCatalogEntry {
  const entry = catalog.find((candidate) => candidate.kind === kind)
  if (!entry) throw new Error(`Editor catalog has no entry for '${kind}'.`)
  return entry
}

let placementSequence = 0
export function nextPlacementId(): string {
  placementSequence += 1
  return `equipment-${placementSequence}`
}

/**
 * Converts an equipment-SDK cell definition into editor placements.
 * Placements referencing unknown definitions are skipped and reported.
 * Robot profile ids not present in the editor catalog are still recognised
 * so sample cells for compact/heavy robots load correctly.
 */
export function cellDefinitionToPlacements(
  cell: CellDefinition,
  catalog: EditorCatalogEntry[],
  robotProfiles?: RobotCatalogService,
): { placements: EditorPlacement[]; skipped: string[] } {
  const byDefinition = new Map(catalog.map((entry) => [entry.definitionId, entry]))
  const robotReach = new Map<string, number>()
  if (robotProfiles) {
    for (const robot of robotProfiles.listRobots()) {
      robotReach.set(robot.id, createSafetyRobotModel(robot).maxReachMeters())
    }
  }

  const placements: EditorPlacement[] = []
  const skipped: string[] = []
  for (const instance of cell.equipment) {
    const entry = byDefinition.get(instance.definitionId)
    if (entry) {
      placements.push({
        id: instance.id,
        kind: entry.kind,
        definitionId: entry.definitionId,
        label: entry.label,
        x: instance.transform.position.x,
        z: instance.transform.position.z,
        rotationRad: instance.transform.rotation.y,
        width: entry.width,
        depth: entry.depth,
        reachMeters: entry.reachMeters,
      })
      continue
    }
    const reach = robotReach.get(instance.definitionId)
    if (reach !== undefined) {
      placements.push({
        id: instance.id,
        kind: 'robot',
        definitionId: instance.definitionId,
        label: `Robot (${instance.definitionId})`,
        x: instance.transform.position.x,
        z: instance.transform.position.z,
        rotationRad: instance.transform.rotation.y,
        width: 1.2,
        depth: 1.2,
        reachMeters: reach,
      })
      continue
    }
    skipped.push(instance.id)
  }
  return { placements, skipped }
}
