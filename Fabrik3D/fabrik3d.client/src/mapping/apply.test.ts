import { describe, expect, it } from 'vitest'
import { evaluateMappingApplication, projectMappingFile } from './apply'
import { createReferenceCellSampleMapping } from './sampleMapping'
import { createReferenceCellCatalog } from './testFixtures'
import type { MappingFileV1 } from './schema'

const catalog = createReferenceCellCatalog()

describe('projectMappingFile', () => {
  it('projects enabled entries per protocol', () => {
    const projection = projectMappingFile(createReferenceCellSampleMapping())
    expect(projection.opcua.map((entry) => entry.signalId)).toEqual(['cnc-1.SpindleSpeed', 'robot-1.Start'])
    expect(projection.mqtt.map((entry) => entry.signalId)).toEqual(['conveyor-1.ActualSpeed', 'conveyor-1.RunCommand'])
    expect(projection.modbus.map((entry) => entry.signalId)).toEqual(['cnc-1.CycleStart', 'cnc-1.FeedRate'])
  })

  it('drops disabled entries from the projection', () => {
    const file = createReferenceCellSampleMapping()
    file.entries.find((entry) => entry.id === 'opcua-robot-start')!.enabled = false
    const projection = projectMappingFile(file)
    expect(projection.opcua.map((entry) => entry.signalId)).toEqual(['cnc-1.SpindleSpeed'])
  })

  it('carries scaling and writability into the Modbus projection', () => {
    const feedRate = projectMappingFile(createReferenceCellSampleMapping()).modbus.find((entry) => entry.signalId === 'cnc-1.FeedRate')
    expect(feedRate?.byteOrder).toBe('big-endian')
    expect(feedRate?.width).toBe(32)
    expect(feedRate?.writable).toBe(false)
  })
})

describe('evaluateMappingApplication', () => {
  it('allows the valid reference sample', () => {
    const decision = evaluateMappingApplication(createReferenceCellSampleMapping(), catalog)
    expect(decision.canApply).toBe(true)
    expect(decision.enabledEntryCount).toBe(6)
    expect(decision.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('rejects a file with a single error without applying anything', () => {
    const file: MappingFileV1 = structuredClone(createReferenceCellSampleMapping())
    file.entries.find((entry) => entry.id === 'opcua-robot-start')!.internalSignalId = 'robot-1.Unknown'
    const decision = evaluateMappingApplication(file, catalog)
    expect(decision.canApply).toBe(false)
    expect(decision.projection).toEqual({ opcua: [], mqtt: [], modbus: [] })
  })

  it('rejects a file with no enabled entries', () => {
    const file = createReferenceCellSampleMapping()
    for (const entry of file.entries) entry.enabled = false
    expect(evaluateMappingApplication(file, catalog).canApply).toBe(false)
  })
})
