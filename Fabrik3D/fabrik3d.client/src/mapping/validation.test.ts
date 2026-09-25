import { describe, expect, it } from 'vitest'
import { createReferenceCellCatalog } from './testFixtures'
import { containsPathTraversal, validateMappingFile } from './validation'
import { createReferenceCellSampleMapping } from './sampleMapping'
import { MAPPING_SCHEMA_VERSION, type MappingEntryV1, type MappingFileV1 } from './schema'

const catalog = createReferenceCellCatalog()

function sample(): MappingFileV1 {
  return createReferenceCellSampleMapping()
}

function codes(file: MappingFileV1): string[] {
  return validateMappingFile(file, catalog).map((diagnostic) => diagnostic.code)
}

function findEntry(file: MappingFileV1, id: string): MappingEntryV1 {
  const entry = file.entries.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`missing fixture entry ${id}`)
  return entry
}

describe('validateMappingFile', () => {
  it('accepts the reference-cell sample for all three protocols', () => {
    const diagnostics = validateMappingFile(sample(), catalog)
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(new Set(sample().entries.map((entry) => entry.protocol))).toEqual(new Set(['opcua', 'mqtt', 'modbus']))
  })

  it('rejects unknown internal signals with a row reference', () => {
    const file = sample()
    findEntry(file, 'opcua-robot-start').internalSignalId = 'robot-1.NotARealSignal'
    const diagnostics = validateMappingFile(file, catalog)
    const unknown = diagnostics.find((diagnostic) => diagnostic.code === 'unknown-signal')
    expect(unknown?.severity).toBe('error')
    expect(unknown?.entryId).toBe('opcua-robot-start')
    expect(unknown?.path).toBe('/entries/1/internalSignalId')
  })

  it('rejects a write direction against a read-only signal', () => {
    const file = sample()
    const entry = findEntry(file, 'opcua-cnc-spindle-speed')
    entry.direction = 'write'
    expect(codes(file)).toContain('unwritable-write-direction')
  })

  it('rejects ambiguous register endianness', () => {
    const file = sample()
    delete findEntry(file, 'modbus-cnc-feed-rate').target.byteOrder
    expect(codes(file)).toContain('ambiguous-endianness')
  })

  it('rejects a multi-word register without an explicit word order', () => {
    const file = sample()
    delete findEntry(file, 'modbus-cnc-feed-rate').target.wordOrder
    expect(codes(file)).toContain('missing-word-order')
  })

  it('rejects unsafe duplicate write targets', () => {
    const file = sample()
    const duplicate = structuredClone(findEntry(file, 'modbus-cnc-cycle-start'))
    duplicate.id = 'modbus-cnc-cycle-start-copy'
    file.entries.push(duplicate)
    const duplicateDiagnostics = validateMappingFile(file, catalog).filter((diagnostic) => diagnostic.code === 'duplicate-write-target')
    expect(duplicateDiagnostics).toHaveLength(1)
    expect(duplicateDiagnostics[0]?.severity).toBe('error')
  })

  it('rejects unknown protocols and unsupported versions', () => {
    const file = sample()
    ;(file as unknown as { schemaVersion: string }).schemaVersion = '2.0'
    ;(findEntry(file, 'opcua-robot-start') as unknown as { protocol: string }).protocol = 'profinet'
    const result = codes(file)
    expect(result).toContain('unsupported-version')
    expect(result).toContain('unsupported-protocol')
  })

  it('rejects executable-looking payload fields', () => {
    const file = sample()
    ;(findEntry(file, 'opcua-robot-start') as unknown as Record<string, unknown>).compute = 'return 42'
    expect(codes(file)).toContain('executable-payload-rejected')
  })

  it('rejects filesystem paths and traversal in target fields', () => {
    const file = sample()
    findEntry(file, 'opcua-robot-start').target.nodeId = 'file:///etc/passwd'
    findEntry(file, 'mqtt-conveyor-actual-speed').target.topic = '../../secrets/topic'
    const result = codes(file)
    expect(result).toContain('path-traversal-rejected')
    expect(result.filter((code) => code === 'path-traversal-rejected')).toHaveLength(2)
  })

  it('rejects unknown fields that could smuggle behaviour', () => {
    const file = sample()
    ;(findEntry(file, 'opcua-robot-start') as unknown as Record<string, unknown>).script = 'doThing()'
    const result = codes(file)
    expect(result).toContain('unknown-field')
    expect(result).toContain('executable-payload-rejected')
  })

  it('rejects MQTT wildcard topics and missing payload fields', () => {
    const file = sample()
    findEntry(file, 'mqtt-conveyor-actual-speed').target.topic = 'fabrik3d/+/telemetry'
    delete findEntry(file, 'mqtt-conveyor-run-command').target.payloadField
    const result = codes(file)
    expect(result).toContain('invalid-topic')
    expect(result).toContain('missing-payload-field')
  })
})

describe('containsPathTraversal', () => {
  it.each([
    ['..\\secret'],
    ['../secret'],
    ['/etc/passwd'],
    ['C:\\Users\\x'],
    ['file:///tmp/x'],
  ])('flags %s', (value) => {
    expect(containsPathTraversal(value)).toBe(true)
  })

  it.each([
    ['ns=2;s=Fabrik3D/Robot/Start'],
    ['fabrik3d/v1/cells/cell/equipment/robot/telemetry'],
    ['ActualSpeed'],
  ])('accepts %s', (value) => {
    expect(containsPathTraversal(value)).toBe(false)
  })
})

describe('schema version constant', () => {
  it('is 1.0', () => {
    expect(MAPPING_SCHEMA_VERSION).toBe('1.0')
  })
})
