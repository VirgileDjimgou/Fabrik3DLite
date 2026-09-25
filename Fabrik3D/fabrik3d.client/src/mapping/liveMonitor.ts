/**
 * Live signal monitor model for the mapping studio.
 *
 * Pure and deterministic: rows merge internal signal samples with external
 * connector health. A disconnected or unhealthy connector marks external values
 * as stale instead of fabricating a value, and filtering is a plain function so
 * it can be unit-tested without a DOM.
 */

import type { SignalQuality, SignalSource } from '../signals/types'
import { directionAllowsRead, type MappingDirection, type MappingEntryV1, type MappingFileV1, type MappingProtocol } from './schema'

export interface MonitorInternalSample {
  value: boolean | number | string
  quality: SignalQuality
  source: SignalSource
  timestamp: string
}

export interface ConnectorHealth {
  protocol: MappingProtocol
  state: string
  healthy: boolean
  lastError?: string
}

export interface MappingMonitorRow {
  entryId: string
  internalSignalId: string
  equipmentId: string
  protocol: MappingProtocol
  direction: MappingDirection
  dataType: string
  scale: number
  offset: number
  unit?: string
  enabled: boolean
  targetLabel: string
  internal: MonitorInternalSample | null
  external: MonitorInternalSample | null
  connectorState: string
  connectorHealthy: boolean
  externalStale: boolean
}

export interface MappingMonitorFilter {
  equipmentId?: string
  protocol?: MappingProtocol | 'all'
  search?: string
}

/** Human-readable external target; canonical identifiers stay untranslated. */
export function mappingTargetLabel(entry: MappingEntryV1): string {
  const target = entry.target
  switch (entry.protocol) {
    case 'opcua':
      return target.nodeId ?? ''
    case 'mqtt':
      return target.payloadField ? `${target.topic}#${target.payloadField}` : target.topic ?? ''
    case 'modbus': {
      const unit = target.unitId !== undefined ? `unit ${target.unitId} ` : ''
      const bit = target.bitIndex !== undefined ? ` bit ${target.bitIndex}` : ''
      return `${unit}${target.area ?? ''}@${target.address ?? ''} width ${target.width ?? ''}${bit}`
    }
    default:
      return ''
  }
}

function defaultHealth(protocol: MappingProtocol): ConnectorHealth {
  return { protocol, state: 'Disabled', healthy: false }
}

export function buildMappingMonitorRows(
  file: MappingFileV1,
  samples: ReadonlyMap<string, MonitorInternalSample>,
  health: ReadonlyMap<MappingProtocol, ConnectorHealth>,
): MappingMonitorRow[] {
  return [...file.entries]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => {
      const connector = health.get(entry.protocol) ?? defaultHealth(entry.protocol)
      const internal = samples.get(entry.internalSignalId) ?? null
      const readsExternal = directionAllowsRead(entry.direction) && connector.healthy && internal !== null
      // External reads reflect the connector's own observation. Without a live
      // connector the value is absent and marked stale, never invented.
      const external = readsExternal ? internal : null
      return {
        entryId: entry.id,
        internalSignalId: entry.internalSignalId,
        equipmentId: entry.equipmentId,
        protocol: entry.protocol,
        direction: entry.direction,
        dataType: entry.dataType,
        scale: entry.scale,
        offset: entry.offset,
        unit: entry.unit,
        enabled: entry.enabled,
        targetLabel: mappingTargetLabel(entry),
        internal,
        external,
        connectorState: connector.state,
        connectorHealthy: connector.healthy,
        externalStale: directionAllowsRead(entry.direction) && !connector.healthy,
      }
    })
}

export function filterMonitorRows(rows: readonly MappingMonitorRow[], filter: MappingMonitorFilter): MappingMonitorRow[] {
  const term = (filter.search ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (filter.equipmentId && filter.equipmentId !== 'all' && row.equipmentId !== filter.equipmentId) return false
    if (filter.protocol && filter.protocol !== 'all' && row.protocol !== filter.protocol) return false
    if (term) {
      const haystack = `${row.internalSignalId} ${row.entryId} ${row.targetLabel}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
}
