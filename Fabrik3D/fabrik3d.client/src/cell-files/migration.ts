/**
 * Migration of older supported cell files to the current schema.
 */

import { CELL_SCHEMA_VERSION, isCellFileV0, isCellFileV1, type CellFileV0, type CellFileV1 } from './schema'
import { CellFileError, errorDiagnostic, warningDiagnostic, type CellFileDiagnostic } from './diagnostics'

/** Maps the legacy equipment `type` field to current `definitionId` values. */
const LEGACY_TYPE_TO_DEFINITION_ID: Record<string, string> = {
  robot: 'medium-6axis',
  cnc: 'educational-cnc',
  conveyor: 'belt-conveyor',
  'pallet-station': 'pallet-station',
  'safety-zone': 'safety-zone',
}

export interface MigrationResult {
  cell: CellFileV1
  migrated: boolean
  diagnostics: CellFileDiagnostic[]
}

/**
 * Converts any supported cell file version to the current schema.
 * Unsupported or malformed inputs throw a `CellFileError` with diagnostics.
 */
export function migrateCellFile(input: string | unknown): MigrationResult {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new CellFileError('Cell file is not valid JSON.', [
        errorDiagnostic('malformed_json', 'The file could not be parsed as JSON.'),
      ])
    }
  }

  if (isCellFileV1(parsed)) {
    return { cell: parsed, migrated: false, diagnostics: [] }
  }

  if (isCellFileV0(parsed)) {
    return migrateV0(parsed)
  }

  throw new CellFileError('Unsupported cell file.', [
    errorDiagnostic('unsupported_version', 'The cell file has no supported schemaVersion. Supported versions: 0.9, 1.0.'),
  ])
}

function migrateV0(legacy: CellFileV0): MigrationResult {
  const diagnostics: CellFileDiagnostic[] = []
  const equipment = legacy.equipment.map((entry) => {
    const definitionId = LEGACY_TYPE_TO_DEFINITION_ID[entry.type]
    if (!definitionId) {
      diagnostics.push(warningDiagnostic(
        'unknown_equipment_type',
        `Legacy equipment type '${entry.type}' has no current definition; kept the raw type as definitionId.`,
        `/equipment/${legacy.equipment.indexOf(entry)}/type`,
      ))
    }
    return {
      id: entry.id,
      definitionId: definitionId ?? entry.type,
      transform: {
        position: { x: entry.position[0], y: entry.position[1], z: entry.position[2] },
        rotation: { x: entry.rotation[0], y: entry.rotation[1], z: entry.rotation[2] },
      },
    }
  })

  return {
    migrated: true,
    diagnostics: [
      warningDiagnostic('migrated_from_0.9', 'Cell file migrated from schemaVersion 0.9 to 1.0.'),
      ...diagnostics,
    ],
    cell: {
      schemaVersion: CELL_SCHEMA_VERSION,
      id: legacy.cell.id,
      name: legacy.cell.name,
      worldFrameId: 'world',
      equipment,
    },
  }
}