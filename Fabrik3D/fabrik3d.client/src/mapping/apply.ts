/**
 * Explicit apply planning for mapping files.
 *
 * Applying is all-or-nothing: any error diagnostic blocks the whole file so a
 * running connector never receives a partially valid map. A projection into
 * protocol-neutral entries is produced only for enabled entries; the server
 * remains the authority for write policy and connector reload.
 */

import type { MappingSignalCatalog } from './catalog'
import { validateMappingFile, type MappingValidationSummary, summarizeMappingDiagnostics } from './validation'
import type { MappingDiagnostic } from './diagnostics'
import type { MappingEntryV1, MappingFileV1 } from './schema'

export interface OpcUaProjectionEntry {
  signalId: string
  nodeId: string
  writable: boolean
  dataType: string
  unit?: string
}

export interface MqttProjectionEntry {
  signalId: string
  topic: string
  payloadField: string
  retain: boolean
  writable: boolean
  dataType: string
  unit?: string
}

export interface ModbusProjectionEntry {
  signalId: string
  area: string
  address: number
  width: number
  bitIndex?: number
  byteOrder?: string
  wordOrder?: string
  signed?: boolean
  unitId?: number
  addressConvention?: string
  scale: number
  offset: number
  writable: boolean
  dataType: string
  unit?: string
}

export interface MappingApplyProjection {
  opcua: OpcUaProjectionEntry[]
  mqtt: MqttProjectionEntry[]
  modbus: ModbusProjectionEntry[]
}

export interface MappingApplyDecision {
  canApply: boolean
  enabledEntryCount: number
  diagnostics: MappingDiagnostic[]
  validation: MappingValidationSummary
  projection: MappingApplyProjection
}

function isWritable(entry: MappingEntryV1): boolean {
  return entry.direction === 'write' || entry.direction === 'read-write'
}

/** Projects enabled, validated entries into protocol-specific configuration. */
export function projectMappingFile(file: MappingFileV1): MappingApplyProjection {
  const projection: MappingApplyProjection = { opcua: [], mqtt: [], modbus: [] }
  for (const entry of [...file.entries].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!entry.enabled) continue
    const writable = isWritable(entry)
    switch (entry.protocol) {
      case 'opcua':
        projection.opcua.push({
          signalId: entry.internalSignalId,
          nodeId: entry.target.nodeId ?? '',
          writable,
          dataType: entry.dataType,
          unit: entry.unit,
        })
        break
      case 'mqtt':
        projection.mqtt.push({
          signalId: entry.internalSignalId,
          topic: entry.target.topic ?? '',
          payloadField: entry.target.payloadField ?? '',
          retain: entry.target.retain ?? false,
          writable,
          dataType: entry.dataType,
          unit: entry.unit,
        })
        break
      case 'modbus':
        projection.modbus.push({
          signalId: entry.internalSignalId,
          area: entry.target.area ?? '',
          address: entry.target.address ?? 0,
          width: entry.target.width ?? 0,
          bitIndex: entry.target.bitIndex,
          byteOrder: entry.target.byteOrder,
          wordOrder: entry.target.wordOrder,
          signed: entry.target.signed,
          unitId: entry.target.unitId,
          addressConvention: entry.target.addressConvention,
          scale: entry.scale,
          offset: entry.offset,
          writable,
          dataType: entry.dataType,
          unit: entry.unit,
        })
        break
      default:
        break
    }
  }
  return projection
}

/** Returns the apply decision for a mapping file. Never partially applies. */
export function evaluateMappingApplication(file: MappingFileV1, catalog: MappingSignalCatalog): MappingApplyDecision {
  const diagnostics = validateMappingFile(file, catalog)
  const validation = summarizeMappingDiagnostics(diagnostics)
  const enabledEntryCount = file.entries.filter((entry) => entry.enabled).length
  const canApply = validation.valid && enabledEntryCount > 0
  return {
    canApply,
    enabledEntryCount,
    diagnostics,
    validation,
    projection: canApply ? projectMappingFile(file) : { opcua: [], mqtt: [], modbus: [] },
  }
}
