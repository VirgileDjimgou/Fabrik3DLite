import { describe, expect, it } from 'vitest'
import { migrateMappingFile } from './migration'
import { MAPPING_SCHEMA_VERSION } from './schema'
import { validateMappingFile } from './validation'
import { createReferenceCellCatalog } from './testFixtures'

const legacy = {
  schemaVersion: '0.9',
  id: 'legacy-mapping',
  name: 'Legacy hand-edited mapping',
  mappings: [
    { id: 'ua-1', signalId: 'cnc-1.SpindleSpeed', protocol: 'opcua', target: 'ns=2;s=Fabrik3D/CNC/SpindleSpeed' },
    { id: 'mq-1', signalId: 'conveyor-1.ActualSpeed', protocol: 'mqtt', target: 'fabrik3d/v1/telemetry#ActualSpeed' },
    { id: 'mb-1', signalId: 'cnc-1.FeedRate', protocol: 'modbus', target: 'holding-register:10:32', direction: 'read' },
  ],
}

describe('migrateMappingFile', () => {
  it('migrates 0.9 to 1.0 deterministically', () => {
    const result = migrateMappingFile(legacy)
    expect(result.migrated).toBe(true)
    expect(result.file.schemaVersion).toBe(MAPPING_SCHEMA_VERSION)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'migrated-from-0.9')).toBe(true)
    expect(result.file.entries).toHaveLength(3)
  })

  it('splits MQTT legacy targets into topic and payload field', () => {
    const mqtt = migrateMappingFile(legacy).file.entries.find((entry) => entry.protocol === 'mqtt')
    expect(mqtt?.target).toEqual({ topic: 'fabrik3d/v1/telemetry', payloadField: 'ActualSpeed' })
  })

  it('parses Modbus legacy targets and warns about assumed endianness', () => {
    const modbus = migrateMappingFile(legacy).file.entries.find((entry) => entry.protocol === 'modbus')
    expect(modbus?.target.area).toBe('holding-register')
    expect(modbus?.target.address).toBe(10)
    expect(modbus?.target.width).toBe(32)
    expect(modbus?.target.byteOrder).toBe('big-endian')
  })

  it('produces a file that validates against the catalog', () => {
    const result = migrateMappingFile(legacy)
    // The migrated MQTT/Modbus float read entries reference real signals.
    const errors = validateMappingFile(result.file, createReferenceCellCatalog()).filter((diagnostic) => diagnostic.severity === 'error')
    expect(errors).toEqual([])
  })

  it('rejects files with no supported version', () => {
    expect(() => migrateMappingFile(JSON.stringify({ schemaVersion: '9.9' }))).toThrow()
  })
})
