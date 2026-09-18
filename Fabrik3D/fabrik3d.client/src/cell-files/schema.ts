/**
 * Versioned cell file schema. Cell files are deterministic, versioned
 * JSON documents meant for Git review. All lengths are meters, rotations
 * radians, expressed in the world frame (X right, Y up, Z forward).
 */

export const CELL_SCHEMA_VERSION = '1.0' as const
export const LEGACY_CELL_SCHEMA_VERSION = '0.9' as const

export const SUPPORTED_SCHEMA_VERSIONS = [LEGACY_CELL_SCHEMA_VERSION, CELL_SCHEMA_VERSION] as const
export type CellSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number]

export interface CellFileTransform {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
}

export interface CellFileEquipmentV1 {
  id: string
  definitionId: string
  transform: CellFileTransform
  parameterValues?: Record<string, string | number | boolean>
}

/** Current cell file format. */
export interface CellFileV1 {
  schemaVersion: typeof CELL_SCHEMA_VERSION
  id: string
  name: string
  worldFrameId: string
  equipment: CellFileEquipmentV1[]
  connections?: import('../equipment').EquipmentConnection[]
}

/** Initial (legacy) cell file format, supported for migration. */
export interface CellFileV0 {
  schemaVersion: typeof LEGACY_CELL_SCHEMA_VERSION
  cell: { id: string; name: string }
  equipment: Array<{
    id: string
    type: string
    position: [number, number, number]
    rotation: [number, number, number]
  }>
}

export function isCellFileV1(value: unknown): value is CellFileV1 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CellFileV1>
  return candidate.schemaVersion === CELL_SCHEMA_VERSION
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.worldFrameId === 'string'
    && Array.isArray(candidate.equipment)
}

export function isCellFileV0(value: unknown): value is CellFileV0 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CellFileV0>
  return candidate.schemaVersion === LEGACY_CELL_SCHEMA_VERSION
    && !!candidate.cell
    && Array.isArray(candidate.equipment)
}
