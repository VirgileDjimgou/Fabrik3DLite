/**
 * Human-readable validation of mapping files (schema 1.0).
 *
 * Treats a mapping file as untrusted input: structural shape, unknown fields,
 * path traversal, unsupported protocol/version, unknown internal signal,
 * direction vs signal writability, ambiguous endianness and unsafe duplicate
 * targets are all reported with row-level diagnostics. An empty error list is
 * required before a mapping may be applied.
 */

import {
  ADDRESS_CONVENTIONS,
  BYTE_ORDERS,
  MAPPING_DATA_TYPES,
  MAPPING_DIRECTIONS,
  MAPPING_PROTOCOLS,
  MAPPING_SCHEMA_VERSION,
  MODBUS_AREAS,
  WORD_ORDERS,
  directionAllowsWrite,
  modbusRegisterCount,
  type MappingEntryV1,
  type MappingFileV1,
  type MappingTargetDescriptor,
} from './schema'
import { detectMappingConflicts } from './conflicts'
import { hasMappingErrors, mappingError, mappingWarning, type MappingDiagnostic } from './diagnostics'
import type { MappingSignalCatalog } from './catalog'

const TOP_LEVEL_KEYS = ['schemaVersion', 'id', 'name', 'description', 'entries'] as const
const ENTRY_KEYS = [
  'id', 'name', 'description', 'protocol', 'internalSignalId', 'equipmentId',
  'direction', 'dataType', 'scale', 'offset', 'unit', 'enabled', 'notes', 'target',
] as const
const TARGET_KEYS = [
  'nodeId', 'topic', 'payloadField', 'retain',
  'area', 'address', 'width', 'bitIndex', 'byteOrder', 'wordOrder', 'signed', 'unitId', 'addressConvention',
] as const

/** Field names that would imply executable behaviour; never allowed in mapping data. */
const EXECUTABLE_KEYS = ['compute', 'script', 'function', 'expression', 'eval', 'exec', 'code', 'formula', 'lambda', 'sql']

const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const FILE_URI = /^file:/i
const MQTT_WILDCARD = /[#+]/

/** True when a target string looks like a filesystem path, a traversal or a file URI. */
export function containsPathTraversal(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return ABSOLUTE_PATH.test(trimmed) || PATH_TRAVERSAL.test(trimmed) || FILE_URI.test(trimmed)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key))
}

function reportExecutableKeys(value: Record<string, unknown>, path: string, entryId: string, diagnostics: MappingDiagnostic[]): boolean {
  let found = false
  for (const key of Object.keys(value)) {
    if (EXECUTABLE_KEYS.includes(key.toLowerCase())) {
      diagnostics.push(mappingError(
        'executable-payload-rejected',
        `Field '${key}' is not allowed: mapping files are data and cannot execute code.`,
        `${path}/${key}`,
        entryId,
      ))
      found = true
    }
  }
  return found
}

export interface MappingValidationSummary {
  valid: boolean
  errors: MappingDiagnostic[]
  warnings: MappingDiagnostic[]
  diagnostics: MappingDiagnostic[]
}

export function summarizeMappingDiagnostics(diagnostics: readonly MappingDiagnostic[]): MappingValidationSummary {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  return { valid: errors.length === 0, errors, warnings, diagnostics: [...diagnostics] }
}

/**
 * Validates a current-schema mapping file against the authoritative internal
 * signal catalog. Returns every diagnostic; an error-free list is required
 * before the mapping can be applied.
 */
export function validateMappingFile(file: MappingFileV1, catalog: MappingSignalCatalog): MappingDiagnostic[] {
  const diagnostics: MappingDiagnostic[] = []

  if (!isRecord(file as unknown as Record<string, unknown>)) {
    diagnostics.push(mappingError('malformed-mapping', 'Mapping file must be a JSON object.', '/'))
    return diagnostics
  }

  const raw = file as unknown as Record<string, unknown>
  if (raw.schemaVersion !== MAPPING_SCHEMA_VERSION) {
    diagnostics.push(mappingError(
      'unsupported-version',
      `Expected schemaVersion '${MAPPING_SCHEMA_VERSION}', got '${String(raw.schemaVersion)}'.`,
      '/schemaVersion',
    ))
  }

  for (const key of unknownKeys(raw, TOP_LEVEL_KEYS)) {
    diagnostics.push(mappingError('unknown-field', `Unknown top-level field '${key}'.`, `/${key}`))
  }
  reportExecutableKeys(raw, '', '', diagnostics)

  if (typeof file.id !== 'string' || file.id.trim() === '') {
    diagnostics.push(mappingError('missing-id', 'Mapping file is missing an id.', '/id'))
  }
  if (typeof file.name !== 'string' || file.name.trim() === '') {
    diagnostics.push(mappingError('missing-name', 'Mapping file is missing a name.', '/name'))
  }
  if (!Array.isArray(file.entries)) {
    diagnostics.push(mappingError('missing-entries', "Mapping file 'entries' must be an array.", '/entries'))
    return diagnostics
  }

  const ids = new Set<string>()
  file.entries.forEach((entry, index) => {
    validateEntry(entry, index, catalog, ids, diagnostics)
  })

  for (const conflict of detectMappingConflicts(file)) {
    const firstEntryId = conflict.entryIds[0] ?? ''
    const path = firstEntryId ? `/entries/${indexOfEntry(file, firstEntryId)}` : '/entries'
    diagnostics.push({
      severity: conflict.severity,
      code: conflict.code,
      message: conflict.message,
      path,
      entryId: firstEntryId,
    })
  }

  return diagnostics
}

function indexOfEntry(file: MappingFileV1, entryId: string): number {
  const index = file.entries.findIndex((entry) => entry?.id === entryId)
  return index < 0 ? 0 : index
}

function validateEntry(
  entry: MappingEntryV1,
  index: number,
  catalog: MappingSignalCatalog,
  ids: Set<string>,
  diagnostics: MappingDiagnostic[],
): void {
  const path = `/entries/${index}`
  if (!isRecord(entry as unknown as Record<string, unknown>)) {
    diagnostics.push(mappingError('malformed-entry', 'Mapping entry must be an object.', path))
    return
  }

  const raw = entry as unknown as Record<string, unknown>
  const entryId = typeof entry.id === 'string' ? entry.id : `#${index}`
  for (const key of unknownKeys(raw, ENTRY_KEYS)) {
    diagnostics.push(mappingError('unknown-field', `Unknown entry field '${key}'.`, `${path}/${key}`, entryId))
  }
  reportExecutableKeys(raw, path, entryId, diagnostics)

  if (typeof entry.id !== 'string' || entry.id.trim() === '') {
    diagnostics.push(mappingError('missing-entry-id', 'Mapping entry is missing an id.', `${path}/id`))
  } else if (ids.has(entry.id)) {
    diagnostics.push(mappingError('duplicate-entry-id', `Duplicate mapping id '${entry.id}'.`, `${path}/id`, entryId))
  } else {
    ids.add(entry.id)
  }
  if (typeof entry.name !== 'string' || entry.name.trim() === '') {
    diagnostics.push(mappingError('missing-entry-name', 'Mapping entry is missing a name.', `${path}/name`, entryId))
  }

  if (!(MAPPING_PROTOCOLS as readonly string[]).includes(entry.protocol)) {
    diagnostics.push(mappingError('unsupported-protocol', `Unsupported protocol '${String(entry.protocol)}'.`, `${path}/protocol`, entryId))
  }
  if (!(MAPPING_DIRECTIONS as readonly string[]).includes(entry.direction)) {
    diagnostics.push(mappingError('invalid-direction', `Direction '${String(entry.direction)}' is not read, write or read-write.`, `${path}/direction`, entryId))
  }
  if (!(MAPPING_DATA_TYPES as readonly string[]).includes(entry.dataType)) {
    diagnostics.push(mappingError('invalid-data-type', `Data type '${String(entry.dataType)}' is not a known signal data type.`, `${path}/dataType`, entryId))
  }
  if (typeof entry.enabled !== 'boolean') {
    diagnostics.push(mappingError('invalid-enabled', 'enabled must be a boolean.', `${path}/enabled`, entryId))
  }
  if (typeof entry.scale !== 'number' || !Number.isFinite(entry.scale) || entry.scale === 0) {
    diagnostics.push(mappingError('invalid-scale', 'scale must be a finite, non-zero number.', `${path}/scale`, entryId))
  }
  if (typeof entry.offset !== 'number' || !Number.isFinite(entry.offset)) {
    diagnostics.push(mappingError('invalid-offset', 'offset must be a finite number.', `${path}/offset`, entryId))
  }

  const signal = typeof entry.internalSignalId === 'string' ? catalog.get(entry.internalSignalId) : undefined
  if (typeof entry.internalSignalId !== 'string' || entry.internalSignalId.trim() === '') {
    diagnostics.push(mappingError('missing-signal-id', 'internalSignalId is required.', `${path}/internalSignalId`, entryId))
  } else if (!signal) {
    diagnostics.push(mappingError(
      'unknown-signal',
      `Internal signal '${entry.internalSignalId}' is not declared in the signal catalog.`,
      `${path}/internalSignalId`,
      entryId,
    ))
  } else {
    if (typeof entry.equipmentId === 'string' && entry.equipmentId.trim() !== '' && entry.equipmentId !== signal.equipmentId) {
      diagnostics.push(mappingWarning(
        'equipment-mismatch',
        `equipmentId '${entry.equipmentId}' does not match the signal's equipment '${signal.equipmentId}'.`,
        `${path}/equipmentId`,
        entryId,
      ))
    }
    if (directionAllowsWrite(entry.direction) && !signal.writable) {
      diagnostics.push(mappingError(
        'unwritable-write-direction',
        `Signal '${entry.internalSignalId}' is read-only but mapping direction is '${entry.direction}'.`,
        `${path}/direction`,
        entryId,
      ))
    }
    if (entry.dataType !== signal.dataType) {
      diagnostics.push(mappingWarning(
        'data-type-mismatch',
        `Mapping data type '${entry.dataType}' differs from signal data type '${signal.dataType}'.`,
        `${path}/dataType`,
        entryId,
      ))
    }
  }

  if (!isRecord(entry.target as unknown as Record<string, unknown>)) {
    diagnostics.push(mappingError('missing-target', 'Mapping entry requires a target descriptor.', `${path}/target`, entryId))
    return
  }

  const targetRaw = entry.target as unknown as Record<string, unknown>
  for (const key of unknownKeys(targetRaw, TARGET_KEYS)) {
    diagnostics.push(mappingError('unknown-field', `Unknown target field '${key}'.`, `${path}/target/${key}`, entryId))
  }
  if (reportExecutableKeys(targetRaw, `${path}/target`, entryId, diagnostics)) {
    return
  }

  for (const [key, value] of Object.entries(targetRaw)) {
    if (typeof value === 'string' && containsPathTraversal(value)) {
      diagnostics.push(mappingError(
        'path-traversal-rejected',
        `Target field '${key}' must not reference a filesystem path ('${value}').`,
        `${path}/target/${key}`,
        entryId,
      ))
    }
  }

  switch (entry.protocol) {
    case 'opcua':
      validateOpcUaTarget(entry, path, entryId, diagnostics)
      break
    case 'mqtt':
      validateMqttTarget(entry, path, entryId, diagnostics)
      break
    case 'modbus':
      validateModbusTarget(entry, path, entryId, diagnostics)
      break
    default:
      // Unsupported protocol already reported; do not guess a target shape.
      break
  }
}

function validateOpcUaTarget(entry: MappingEntryV1, path: string, entryId: string, diagnostics: MappingDiagnostic[]): void {
  const target = entry.target
  if (typeof target.nodeId !== 'string' || target.nodeId.trim() === '') {
    diagnostics.push(mappingError('missing-node-id', "OPC UA mapping requires a 'nodeId'.", `${path}/target/nodeId`, entryId))
  }
}

function validateMqttTarget(entry: MappingEntryV1, path: string, entryId: string, diagnostics: MappingDiagnostic[]): void {
  const target = entry.target
  if (typeof target.topic !== 'string' || target.topic.trim() === '') {
    diagnostics.push(mappingError('missing-topic', "MQTT mapping requires a 'topic'.", `${path}/target/topic`, entryId))
  } else if (MQTT_WILDCARD.test(target.topic)) {
    diagnostics.push(mappingError('invalid-topic', 'MQTT mapping topics must be concrete and cannot contain wildcards (+/#).', `${path}/target/topic`, entryId))
  }
  if (typeof target.payloadField !== 'string' || target.payloadField.trim() === '') {
    diagnostics.push(mappingError('missing-payload-field', "MQTT mapping requires a 'payloadField'.", `${path}/target/payloadField`, entryId))
  } else if (MQTT_WILDCARD.test(target.payloadField)) {
    diagnostics.push(mappingError('invalid-payload-field', 'payloadField must be a concrete JSON field name.', `${path}/target/payloadField`, entryId))
  }
}

function validateModbusTarget(entry: MappingEntryV1, path: string, entryId: string, diagnostics: MappingDiagnostic[]): void {
  const target = entry.target
  const area = target.area
  if (typeof area !== 'string' || !(MODBUS_AREAS as readonly string[]).includes(area)) {
    diagnostics.push(mappingError('invalid-area', `Area '${String(area)}' is not coil, discrete-input, input-register or holding-register.`, `${path}/target/area`, entryId))
    return
  }

  if (!Number.isInteger(target.address) || (target.address ?? -1) < 0) {
    diagnostics.push(mappingError('invalid-address', 'Modbus address must be a non-negative integer.', `${path}/target/address`, entryId))
  }
  if (!Number.isInteger(target.width) || (target.width ?? 0) <= 0) {
    diagnostics.push(mappingError('invalid-width', 'Modbus width must be a positive integer.', `${path}/target/width`, entryId))
  }
  if (target.addressConvention !== undefined && !(ADDRESS_CONVENTIONS as readonly string[]).includes(target.addressConvention)) {
    diagnostics.push(mappingError('invalid-address-convention', `Address convention '${String(target.addressConvention)}' is not zero-based or one-based.`, `${path}/target/addressConvention`, entryId))
  }
  if (target.unitId !== undefined && (!Number.isInteger(target.unitId) || target.unitId < 1 || target.unitId > 247)) {
    diagnostics.push(mappingError('invalid-unit-id', 'unitId must be an integer between 1 and 247.', `${path}/target/unitId`, entryId))
  }

  const registerArea = area === 'input-register' || area === 'holding-register'
  const dataType = entry.dataType

  if (dataType === 'bool') {
    if (registerArea) {
      if (target.width !== 16) {
        diagnostics.push(mappingError('invalid-width', `Boolean register mapping '${entry.id}' must declare width 16.`, `${path}/target/width`, entryId))
      }
      if (!Number.isInteger(target.bitIndex) || (target.bitIndex ?? -1) < 0 || (target.bitIndex ?? 16) > 15) {
        diagnostics.push(mappingError('invalid-bit-index', 'Boolean register mapping requires bitIndex between 0 and 15.', `${path}/target/bitIndex`, entryId))
      }
    } else {
      if (target.width !== 1) {
        diagnostics.push(mappingError('invalid-width', `Boolean ${area} mapping '${entry.id}' must declare width 1.`, `${path}/target/width`, entryId))
      }
      if (target.bitIndex !== undefined) {
        diagnostics.push(mappingError('invalid-bit-index', `Boolean ${area} mapping cannot carry a bitIndex.`, `${path}/target/bitIndex`, entryId))
      }
    }
  } else if (dataType === 'int' || dataType === 'uint') {
    if (target.width !== 16 && target.width !== 32) {
      diagnostics.push(mappingError('invalid-width', 'Integer mapping must declare width 16 or 32 (64-bit integers are unsupported).', `${path}/target/width`, entryId))
    }
  } else if (dataType === 'float') {
    if (target.width !== 32 && target.width !== 64) {
      diagnostics.push(mappingError('invalid-width', 'Float mapping must declare width 32 or 64.', `${path}/target/width`, entryId))
    }
  }

  if (registerArea) {
    if (target.byteOrder === undefined) {
      diagnostics.push(mappingError('ambiguous-endianness', 'Register mapping must declare byteOrder explicitly.', `${path}/target/byteOrder`, entryId))
    } else if (!(BYTE_ORDERS as readonly string[]).includes(target.byteOrder)) {
      diagnostics.push(mappingError('invalid-byte-order', `byteOrder '${String(target.byteOrder)}' is not big-endian or little-endian.`, `${path}/target/byteOrder`, entryId))
    }

    if (typeof target.width === 'number' && target.width > 16) {
      if (target.wordOrder === undefined) {
        diagnostics.push(mappingError('missing-word-order', 'Multi-word mapping must declare wordOrder explicitly.', `${path}/target/wordOrder`, entryId))
      } else if (!(WORD_ORDERS as readonly string[]).includes(target.wordOrder)) {
        diagnostics.push(mappingError('invalid-word-order', `wordOrder '${String(target.wordOrder)}' is not high-word-first or low-word-first.`, `${path}/target/wordOrder`, entryId))
      }
    }
  } else if (target.bitIndex !== undefined) {
    diagnostics.push(mappingError('invalid-bit-index', `${area} mappings are bit-level and cannot carry a bitIndex.`, `${path}/target/bitIndex`, entryId))
  }

  if (Number.isInteger(target.address) && (target.address ?? -1) >= 0 && Number.isInteger(target.width) && (target.width ?? 0) > 0) {
    const count = modbusRegisterCount(target)
    const last = (target.address ?? 0) + count - 1
    if (last > 65535) {
      diagnostics.push(mappingError('address-out-of-range', `Mapping spans zero-based addresses ${target.address}..${last}, beyond 65535.`, `${path}/target/address`, entryId))
    }
  }
}

/** Convenience: true when the file has no error-level diagnostics. */
export function canApplyMapping(diagnostics: readonly MappingDiagnostic[]): boolean {
  return !hasMappingErrors(diagnostics)
}
