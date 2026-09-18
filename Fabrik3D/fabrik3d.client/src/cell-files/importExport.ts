/**
 * Deterministic import/export of cell files.
 */

import type { CellDefinition, EquipmentInstance } from '../equipment'
import { EQUIPMENT_SDK_VERSION, createTransform, WORLD_FRAME_ID } from '../equipment'
import { CELL_SCHEMA_VERSION, type CellFileV1 } from './schema'
import { migrateCellFile } from './migration'
import { validateCellFile } from './validation'
import type { CellFileDiagnostic } from './diagnostics'

/**
 * Serializes a cell file deterministically: fixed key order, stable
 * formatting, no timestamps, so files are reviewable in Git.
 */
export function serializeCellFile(cell: CellFileV1, pretty = true): string {
  const normalized = {
    schemaVersion: CELL_SCHEMA_VERSION,
    id: cell.id,
    name: cell.name,
    worldFrameId: cell.worldFrameId,
    equipment: cell.equipment.map((entry) => ({
      id: entry.id,
      definitionId: entry.definitionId,
      transform: {
        position: { x: entry.transform.position.x, y: entry.transform.position.y, z: entry.transform.position.z },
        rotation: { x: entry.transform.rotation.x, y: entry.transform.rotation.y, z: entry.transform.rotation.z },
      },
    })),
  }
  return pretty ? JSON.stringify(normalized, null, 2) : JSON.stringify(normalized)
}

/** Parses, migrates, and validates a cell file string. */
export function parseCellFile(text: string, knownDefinitionIds?: ReadonlySet<string>): {
  cell: CellFileV1
  migrated: boolean
  diagnostics: CellFileDiagnostic[]
} {
  const { cell, migrated, diagnostics: migrationDiagnostics } = migrateCellFile(text)
  const validationDiagnostics = validateCellFile(cell, knownDefinitionIds)
  return { cell, migrated, diagnostics: [...migrationDiagnostics, ...validationDiagnostics] }
}

/** Wraps an equipment-SDK cell definition as a current cell file. */
export function toCellFile(cell: CellDefinition): CellFileV1 {
  return {
    schemaVersion: CELL_SCHEMA_VERSION,
    id: cell.id,
    name: cell.name,
    worldFrameId: cell.worldFrameId,
    equipment: cell.equipment.map((instance) => ({
      id: instance.id,
      definitionId: instance.definitionId,
      transform: {
        position: { x: instance.transform.position.x, y: instance.transform.position.y, z: instance.transform.position.z },
        rotation: { x: instance.transform.rotation.x, y: instance.transform.rotation.y, z: instance.transform.rotation.z },
      },
    })),
  }
}

/** Converts a current cell file back into an equipment-SDK cell definition. */
export function fromCellFile(file: CellFileV1): CellDefinition {
  const equipment: EquipmentInstance[] = file.equipment.map((entry) => ({
    id: entry.id,
    definitionId: entry.definitionId,
    transform: createTransform(
      { x: entry.transform.position.x, y: entry.transform.position.y, z: entry.transform.position.z },
      { x: entry.transform.rotation.x, y: entry.transform.rotation.y, z: entry.transform.rotation.z },
      WORLD_FRAME_ID,
    ),
  }))
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: file.id,
    name: file.name,
    worldFrameId: file.worldFrameId,
    equipment,
  }
}

/** Triggers a local download of the cell file. */
export function downloadCellFile(cell: CellFileV1, filename: string): void {
  const blob = new Blob([serializeCellFile(cell)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Empty cell file helper used by editors before any equipment is added. */
export function emptyCellFile(id = 'empty-cell', name = 'Empty cell'): CellFileV1 {
  return { schemaVersion: CELL_SCHEMA_VERSION, id, name, worldFrameId: WORLD_FRAME_ID, equipment: [] }
}