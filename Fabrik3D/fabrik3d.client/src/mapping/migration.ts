/**
 * Migration of the documented earlier mapping shape (0.9) to schema 1.0.
 *
 * The legacy shape was hand-edited and carried a single opaque `target` string:
 * - opcua: the node id;
 * - mqtt: `topic#payloadField`;
 * - modbus: `area:address:width`.
 * Migration is deterministic and never invents scaling or direction: missing
 * values fall back to documented safe defaults and are reported as warnings.
 */

import {
  MAPPING_SCHEMA_VERSION,
  isMappingFileV0,
  isMappingFileV1,
  type MappingDataType,
  type MappingDirection,
  type MappingEntryV1,
  type MappingFileV0,
  type MappingFileV1,
  type MappingProtocol,
  type MappingTargetDescriptor,
} from './schema'
import { MappingFileError, mappingError, mappingWarning, type MappingDiagnostic } from './diagnostics'

export interface MappingMigrationResult {
  file: MappingFileV1
  migrated: boolean
  diagnostics: MappingDiagnostic[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Converts any supported mapping file version to the current schema. */
export function migrateMappingFile(input: string | unknown): MappingMigrationResult {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new MappingFileError('Mapping file is not valid JSON.', [
        mappingError('malformed-json', 'The file could not be parsed as JSON.'),
      ])
    }
  }

  if (isMappingFileV1(parsed)) {
    return { file: parsed, migrated: false, diagnostics: [] }
  }

  if (isMappingFileV0(parsed)) {
    return migrateV0(parsed)
  }

  throw new MappingFileError('Unsupported mapping file.', [
    mappingError('unsupported-version', `The mapping file has no supported schemaVersion. Supported versions: 0.9, ${MAPPING_SCHEMA_VERSION}.`),
  ])
}

function parseLegacyTarget(protocol: string, target: string): MappingTargetDescriptor {
  const normalized = target.trim()
  switch (protocol) {
    case 'opcua':
      return { nodeId: normalized }
    case 'mqtt': {
      const separator = normalized.indexOf('#')
      return separator >= 0
        ? { topic: normalized.slice(0, separator), payloadField: normalized.slice(separator + 1) }
        : { topic: normalized, payloadField: '' }
    }
    case 'modbus': {
      const [area, address, width] = normalized.split(':')
      return {
        area: area as MappingTargetDescriptor['area'],
        address: Number.parseInt(address ?? '', 10),
        width: Number.parseInt(width ?? '16', 10),
        byteOrder: 'big-endian',
        wordOrder: 'high-word-first',
      }
    }
    default:
      return {}
  }
}

function migrateV0(legacy: MappingFileV0): MappingMigrationResult {
  const diagnostics: MappingDiagnostic[] = [
    mappingWarning('migrated-from-0.9', 'Mapping file migrated from schemaVersion 0.9 to 1.0.'),
  ]

  const entries: MappingEntryV1[] = legacy.mappings.map((mapping, index) => {
    const path = `/mappings/${index}`
    const protocol = (mapping.protocol ?? '').trim().toLowerCase()
    if (protocol !== 'opcua' && protocol !== 'mqtt' && protocol !== 'modbus') {
      diagnostics.push(mappingWarning(
        'unknown-legacy-protocol',
        `Legacy mapping '${mapping.id}' declares unknown protocol '${String(mapping.protocol)}'; kept as-is for review.`,
        `${path}/protocol`,
        mapping.id,
      ))
    }

    const direction = normalizeDirection(mapping.direction, mapping.id, path, diagnostics)
    const target = parseLegacyTarget(protocol, mapping.target ?? '')
    const isRegister = target.area === 'input-register' || target.area === 'holding-register'
    const dataType: MappingDataType = target.area === 'coil' || target.area === 'discrete-input' ? 'bool' : 'uint'

    if (isRegister && target.byteOrder === 'big-endian') {
      diagnostics.push(mappingWarning(
        'endianness-defaulted',
        `Legacy Modbus target for '${mapping.id}' did not declare endianness; assumed big-endian/high-word-first. Review before applying.`,
        `${path}/target`,
        mapping.id,
      ))
    }

    return {
      id: mapping.id,
      name: mapping.id,
      protocol: protocol as MappingProtocol,
      internalSignalId: mapping.signalId,
      equipmentId: signalEquipment(mapping.signalId),
      direction,
      dataType,
      scale: 1,
      offset: 0,
      enabled: mapping.enabled ?? true,
      target,
    }
  })

  return {
    migrated: true,
    diagnostics,
    file: {
      schemaVersion: MAPPING_SCHEMA_VERSION,
      id: legacy.id,
      name: legacy.name,
      entries,
    },
  }
}

function normalizeDirection(
  direction: string | undefined,
  mappingId: string,
  path: string,
  diagnostics: MappingDiagnostic[],
): MappingDirection {
  const normalized = (direction ?? 'read').trim().toLowerCase()
  if (normalized === 'read' || normalized === 'write' || normalized === 'read-write') {
    return normalized
  }
  diagnostics.push(mappingWarning(
    'direction-defaulted',
    `Legacy direction '${String(direction)}' for '${mappingId}' is unknown; assumed read.`,
    `${path}/direction`,
    mappingId,
  ))
  return 'read'
}

function signalEquipment(signalId: string): string {
  const index = signalId.indexOf('.')
  return index > 0 ? signalId.slice(0, index) : signalId
}
