import { describe, expect, it } from 'vitest'
import { buildMappingMonitorRows, filterMonitorRows, mappingTargetLabel } from './liveMonitor'
import { createReferenceCellSampleMapping } from './sampleMapping'
import type { ConnectorHealth, MonitorInternalSample } from './liveMonitor'
import type { MappingProtocol } from './schema'

const sample: MonitorInternalSample = {
  value: 8000,
  quality: 'good',
  source: 'simulated',
  timestamp: '2026-01-01T08:00:00.000Z',
}

function healthy(protocol: MappingProtocol): ConnectorHealth {
  return { protocol, state: 'Connected', healthy: true }
}

describe('mappingTargetLabel', () => {
  it('renders protocol-specific targets without translating identifiers', () => {
    const entries = createReferenceCellSampleMapping().entries
    expect(mappingTargetLabel(entries.find((entry) => entry.protocol === 'opcua')!)).toBe('ns=2;s=Fabrik3D/CNC/SpindleSpeed')
    expect(mappingTargetLabel(entries.find((entry) => entry.protocol === 'mqtt')!)).toContain('#ActualSpeed')
    expect(mappingTargetLabel(entries.find((entry) => entry.protocol === 'modbus')!)).toContain('holding-register@10')
  })
})

describe('buildMappingMonitorRows', () => {
  it('marks external values stale when the connector is unhealthy and never fabricates a value', () => {
    const health = new Map<MappingProtocol, ConnectorHealth>([[ 'opcua', { protocol: 'opcua', state: 'Error', healthy: false }]])
    const rows = buildMappingMonitorRows(createReferenceCellSampleMapping(), new Map([['cnc-1.SpindleSpeed', sample]]), health)
    const row = rows.find((candidate) => candidate.internalSignalId === 'cnc-1.SpindleSpeed')!
    expect(row.internal?.value).toBe(8000)
    expect(row.external).toBeNull()
    expect(row.externalStale).toBe(true)
    expect(row.connectorHealthy).toBe(false)
  })

  it('exposes external values with quality, source and timestamp when healthy', () => {
    const protocols: MappingProtocol[] = ['opcua', 'mqtt', 'modbus']
    const health = new Map<MappingProtocol, ConnectorHealth>(protocols.map((protocol) => [protocol, healthy(protocol)] as const))
    const rows = buildMappingMonitorRows(createReferenceCellSampleMapping(), new Map([['cnc-1.SpindleSpeed', sample]]), health)
    const row = rows.find((candidate) => candidate.internalSignalId === 'cnc-1.SpindleSpeed')!
    expect(row.external?.quality).toBe('good')
    expect(row.external?.source).toBe('simulated')
    expect(row.external?.timestamp).toBe('2026-01-01T08:00:00.000Z')
    expect(row.externalStale).toBe(false)
  })
})

describe('filterMonitorRows', () => {
  it('filters by equipment and protocol', () => {
    const rows = buildMappingMonitorRows(createReferenceCellSampleMapping(), new Map(), new Map())
    expect(filterMonitorRows(rows, { equipmentId: 'cnc-1' }).every((row) => row.equipmentId === 'cnc-1')).toBe(true)
    expect(filterMonitorRows(rows, { protocol: 'mqtt' })).toHaveLength(2)
    expect(filterMonitorRows(rows, { protocol: 'all', equipmentId: 'all' })).toHaveLength(6)
  })

  it('supports free-text search over signal id and target', () => {
    const rows = buildMappingMonitorRows(createReferenceCellSampleMapping(), new Map(), new Map())
    expect(filterMonitorRows(rows, { search: 'SpindleSpeed' }).map((row) => row.entryId)).toEqual(['opcua-cnc-spindle-speed'])
    expect(filterMonitorRows(rows, { search: 'RunCommand' }).map((row) => row.entryId)).toEqual(['mqtt-conveyor-run-command'])
  })
})
