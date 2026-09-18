/**
 * Human-readable validation of cell files against the current schema.
 */

import type { CellFileDiagnostic } from './diagnostics'
import { errorDiagnostic, warningDiagnostic } from './diagnostics'
import type { CellFileEquipmentV1, CellFileV1 } from './schema'

const POSITION_KEYS = ['x', 'y', 'z'] as const
const ROTATION_KEYS = ['x', 'y', 'z'] as const

/**
 * Validates a current-schema cell file. Returns human-readable diagnostics;
 * an empty array means the file is conformant. When `knownDefinitionIds` is
 * provided, unknown definition references are reported as warnings.
 */
export function validateCellFile(cell: CellFileV1, knownDefinitionIds?: ReadonlySet<string>): CellFileDiagnostic[] {
  const diagnostics: CellFileDiagnostic[] = []

  if (!cell.id?.trim()) diagnostics.push(errorDiagnostic('missing_id', 'Cell file is missing an id.', '/id'))
  if (!cell.name?.trim()) diagnostics.push(errorDiagnostic('missing_name', 'Cell file is missing a name.', '/name'))
  if (!cell.worldFrameId?.trim()) diagnostics.push(errorDiagnostic('missing_world_frame', 'Cell file is missing a worldFrameId.', '/worldFrameId'))
  if (cell.schemaVersion !== '1.0') diagnostics.push(errorDiagnostic('unsupported_version', `Expected schemaVersion 1.0, got '${cell.schemaVersion}'.`, '/schemaVersion'))

  if (!Array.isArray(cell.equipment)) {
    diagnostics.push(errorDiagnostic('missing_equipment', 'Cell file is missing the equipment list.', '/equipment'))
    return diagnostics
  }

  const ids = new Set<string>()
  cell.equipment.forEach((equipment, index) => {
    const path = `/equipment/${index}`
    validateEquipment(equipment, path, diagnostics)

    if (ids.has(equipment.id)) diagnostics.push(errorDiagnostic('duplicate_id', `Duplicate equipment id '${equipment.id}'.`, `${path}/id`))
    ids.add(equipment.id)

    if (knownDefinitionIds && !knownDefinitionIds.has(equipment.definitionId)) {
      diagnostics.push(warningDiagnostic(
        'unknown_definition',
        `Equipment '${equipment.id}' references unknown definition '${equipment.definitionId}'.`,
        `${path}/definitionId`,
      ))
    }
  })

  return diagnostics
}

function validateEquipment(equipment: CellFileEquipmentV1, path: string, diagnostics: CellFileDiagnostic[]): void {
  if (!equipment.id?.trim()) diagnostics.push(errorDiagnostic('missing_equipment_id', 'Equipment is missing an id.', `${path}/id`))
  if (!equipment.definitionId?.trim()) diagnostics.push(errorDiagnostic('missing_definition', 'Equipment is missing a definitionId.', `${path}/definitionId`))

  if (!equipment.transform) {
    diagnostics.push(errorDiagnostic('missing_transform', 'Equipment is missing a transform.', `${path}/transform`))
    return
  }
  for (const key of POSITION_KEYS) {
    if (!Number.isFinite(equipment.transform.position?.[key])) {
      diagnostics.push(errorDiagnostic('non_finite_position', `Equipment position.${key} is not a finite number.`, `${path}/transform/position/${key}`))
    }
  }
  for (const key of ROTATION_KEYS) {
    if (!Number.isFinite(equipment.transform.rotation?.[key])) {
      diagnostics.push(errorDiagnostic('non_finite_rotation', `Equipment rotation.${key} is not a finite number.`, `${path}/transform/rotation/${key}`))
    }
  }
}