/**
 * Versioned signal-mapping file schema (S37).
 *
 * A mapping file connects an internal, protocol-free equipment signal to an
 * external controller address for OPC UA, MQTT or Modbus. It is plain,
 * deterministic JSON data reviewed in Git: it can never execute code, carry a
 * script/expression, or reference a filesystem path. Wire details (node ids,
 * topics, register addresses, endianness, scaling) stay in this artifact and
 * are projected into the protocol adapters only at an explicit apply step.
 *
 * Canonical identifiers are engineering data and are never translated.
 */

export const MAPPING_SCHEMA_VERSION = '1.0' as const
export const LEGACY_MAPPING_SCHEMA_VERSION = '0.9' as const
export const SUPPORTED_MAPPING_SCHEMA_VERSIONS = [LEGACY_MAPPING_SCHEMA_VERSION, MAPPING_SCHEMA_VERSION] as const
export type MappingSchemaVersion = (typeof SUPPORTED_MAPPING_SCHEMA_VERSIONS)[number]

export const MAPPING_PROTOCOLS = ['opcua', 'mqtt', 'modbus'] as const
export type MappingProtocol = (typeof MAPPING_PROTOCOLS)[number]

/** Direction is expressed relative to the controller boundary. */
export const MAPPING_DIRECTIONS = ['read', 'write', 'read-write'] as const
export type MappingDirection = (typeof MAPPING_DIRECTIONS)[number]

export const MAPPING_DATA_TYPES = ['bool', 'int', 'uint', 'float', 'enum', 'string'] as const
export type MappingDataType = (typeof MAPPING_DATA_TYPES)[number]

export const MODBUS_AREAS = ['coil', 'discrete-input', 'input-register', 'holding-register'] as const
export type ModbusArea = (typeof MODBUS_AREAS)[number]

export const BYTE_ORDERS = ['big-endian', 'little-endian'] as const
export type ByteOrder = (typeof BYTE_ORDERS)[number]

export const WORD_ORDERS = ['high-word-first', 'low-word-first'] as const
export type WordOrder = (typeof WORD_ORDERS)[number]

export const ADDRESS_CONVENTIONS = ['zero-based', 'one-based'] as const
export type AddressConvention = (typeof ADDRESS_CONVENTIONS)[number]

/**
 * Protocol-specific external target descriptor. Exactly one protocol group is
 * required per entry; unused fields must stay absent so the file stays
 * unambiguous and deterministic.
 */
export interface MappingTargetDescriptor {
  /** OPC UA */
  nodeId?: string
  /** MQTT */
  topic?: string
  payloadField?: string
  retain?: boolean
  /** Modbus */
  area?: ModbusArea
  address?: number
  width?: number
  bitIndex?: number
  byteOrder?: ByteOrder
  wordOrder?: WordOrder
  signed?: boolean
  unitId?: number
  addressConvention?: AddressConvention
}

export interface MappingEntryV1 {
  id: string
  name: string
  description?: string
  protocol: MappingProtocol
  /** Internal signal id, authoritative from the simulator signal catalog (S32). */
  internalSignalId: string
  equipmentId: string
  direction: MappingDirection
  dataType: MappingDataType
  /** Engineering value = raw * scale + offset. */
  scale: number
  offset: number
  unit?: string
  enabled: boolean
  notes?: string
  target: MappingTargetDescriptor
}

export interface MappingFileV1 {
  schemaVersion: typeof MAPPING_SCHEMA_VERSION
  id: string
  name: string
  description?: string
  entries: MappingEntryV1[]
}

/** Documented earlier hand-edited shape, kept only for migration to 1.0. */
export interface MappingFileV0 {
  schemaVersion: typeof LEGACY_MAPPING_SCHEMA_VERSION
  id: string
  name: string
  mappings: Array<{
    id: string
    signalId: string
    protocol: string
    /** `nodeId` for opcua, `topic#payloadField` for mqtt, `area:address:width` for modbus. */
    target: string
    direction?: string
    enabled?: boolean
  }>
}

export function isMappingFileV1(value: unknown): value is MappingFileV1 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MappingFileV1>
  return candidate.schemaVersion === MAPPING_SCHEMA_VERSION
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.entries)
}

export function isMappingFileV0(value: unknown): value is MappingFileV0 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MappingFileV0>
  return candidate.schemaVersion === LEGACY_MAPPING_SCHEMA_VERSION
    && typeof candidate.id === 'string'
    && Array.isArray(candidate.mappings)
}

/** Stable identity of an external target, used for duplicate/conflict detection. */
export function mappingTargetKey(entry: MappingEntryV1): string {
  const target = entry.target
  switch (entry.protocol) {
    case 'opcua':
      return `opcua:${target.nodeId ?? ''}`
    case 'mqtt':
      return `mqtt:${target.topic ?? ''}#${target.payloadField ?? ''}`
    case 'modbus': {
      const convention = target.addressConvention ?? 'zero-based'
      const unit = target.unitId ?? ''
      const bit = target.bitIndex === undefined ? '' : `.${target.bitIndex}`
      return `modbus:${convention}:${unit}:${target.area ?? ''}@${target.address ?? ''}:${target.width ?? ''}${bit}`
    }
    default:
      return `${String(entry.protocol)}:unknown`
  }
}

export function directionAllowsWrite(direction: MappingDirection): boolean {
  return direction === 'write' || direction === 'read-write'
}

export function directionAllowsRead(direction: MappingDirection): boolean {
  return direction === 'read' || direction === 'read-write'
}

/** Total Modbus registers/coils occupied by a target. Bit points occupy one. */
export function modbusRegisterCount(target: MappingTargetDescriptor): number {
  const width = target.width ?? 0
  if (width <= 1) return 1
  return width <= 16 ? 1 : 2
}
