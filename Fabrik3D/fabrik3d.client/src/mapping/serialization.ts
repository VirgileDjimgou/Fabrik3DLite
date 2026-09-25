/**
 * Deterministic serialization of mapping files.
 *
 * Entries are sorted by id and every key is emitted in a fixed order, so two
 * semantically equal files serialize byte-for-byte identically. No timestamp is
 * written: mapping files are reviewable in Git and round-trip exactly.
 */

import {
  MAPPING_SCHEMA_VERSION,
  type MappingEntryV1,
  type MappingFileV1,
  type MappingTargetDescriptor,
} from './schema'
import { MappingFileError, mappingError, mappingWarning, type MappingDiagnostic } from './diagnostics'
import { migrateMappingFile } from './migration'

/** Largest accepted mapping file, in bytes. Untrusted input is size-bounded. */
export const MAX_MAPPING_FILE_BYTES = 512 * 1024

export interface ParseMappingOptions {
  maxBytes?: number
}

export interface ParseMappingResult {
  file: MappingFileV1
  migrated: boolean
  diagnostics: MappingDiagnostic[]
}

function serializeTarget(entry: MappingEntryV1): Record<string, unknown> {
  const target = entry.target
  switch (entry.protocol) {
    case 'opcua':
      return { nodeId: target.nodeId }
    case 'mqtt':
      return {
        topic: target.topic,
        payloadField: target.payloadField,
        ...(target.retain !== undefined ? { retain: target.retain } : {}),
      }
    case 'modbus':
      return {
        area: target.area,
        address: target.address,
        width: target.width,
        ...(target.bitIndex !== undefined ? { bitIndex: target.bitIndex } : {}),
        ...(target.byteOrder !== undefined ? { byteOrder: target.byteOrder } : {}),
        ...(target.wordOrder !== undefined ? { wordOrder: target.wordOrder } : {}),
        ...(target.signed !== undefined ? { signed: target.signed } : {}),
        ...(target.unitId !== undefined ? { unitId: target.unitId } : {}),
        ...(target.addressConvention !== undefined ? { addressConvention: target.addressConvention } : {}),
      }
    default:
      return { ...(target as MappingTargetDescriptor as Record<string, unknown>) }
  }
}

function serializeEntry(entry: MappingEntryV1): Record<string, unknown> {
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    protocol: entry.protocol,
    internalSignalId: entry.internalSignalId,
    equipmentId: entry.equipmentId,
    direction: entry.direction,
    dataType: entry.dataType,
    scale: entry.scale,
    offset: entry.offset,
    ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
    enabled: entry.enabled,
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
    target: serializeTarget(entry),
  }
}

/** Serializes a mapping file deterministically (stable ordering and formatting). */
export function serializeMappingFile(file: MappingFileV1, pretty = true): string {
  const normalized = {
    schemaVersion: MAPPING_SCHEMA_VERSION,
    id: file.id,
    name: file.name,
    ...(file.description !== undefined ? { description: file.description } : {}),
    entries: [...file.entries]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(serializeEntry),
  }
  return pretty ? JSON.stringify(normalized, null, 2) : JSON.stringify(normalized)
}

/**
 * Parses and migrates a mapping file string. Rejects oversized input and
 * non-JSON payloads; the caller must still run semantic validation against the
 * signal catalog before applying.
 */
export function parseMappingFile(text: string, options: ParseMappingOptions = {}): ParseMappingResult {
  const maxBytes = options.maxBytes ?? MAX_MAPPING_FILE_BYTES
  const size = typeof text === 'string' ? new TextEncoder().encode(text).length : 0
  if (size > maxBytes) {
    throw new MappingFileError('Mapping file is too large.', [
      mappingError('file-too-large', `Mapping file is ${size} bytes; the limit is ${maxBytes} bytes.`),
    ])
  }

  const { file, migrated, diagnostics } = migrateMappingFile(text)
  return { file, migrated, diagnostics }
}

/** Parses, migrates and then round-trips through the deterministic serializer. */
export function roundTripMappingFile(text: string, options: ParseMappingOptions = {}): ParseMappingResult {
  const parsed = parseMappingFile(text, options)
  const reparsed = parseMappingFile(serializeMappingFile(parsed.file), options)
  const extra: MappingDiagnostic[] = []
  if (serializeMappingFile(parsed.file) !== serializeMappingFile(reparsed.file)) {
    extra.push(mappingError('round-trip-mismatch', 'Mapping file did not round-trip deterministically.'))
  } else {
    extra.push(mappingWarning('round-trip-stable', 'Mapping file round-trips deterministically.'))
  }
  return { file: reparsed.file, migrated: reparsed.migrated, diagnostics: [...parsed.diagnostics, ...extra] }
}
