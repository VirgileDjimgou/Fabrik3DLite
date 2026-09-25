import { describe, expect, it } from 'vitest'
import { detectMappingConflicts } from './conflicts'
import { createReferenceCellSampleMapping } from './sampleMapping'
import type { MappingFileV1 } from './schema'

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe('detectMappingConflicts', () => {
  it('reports no conflicts for the reference sample', () => {
    expect(detectMappingConflicts(createReferenceCellSampleMapping())).toEqual([])
  })

  it('flags two writers of the same external target as an error', () => {
    const file: MappingFileV1 = clone(createReferenceCellSampleMapping())
    const original = file.entries.find((entry) => entry.id === 'opcua-robot-start')!
    const duplicate = clone(original)
    duplicate.id = 'opcua-robot-start-2'
    file.entries.push(duplicate)
    const conflicts = detectMappingConflicts(file)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.code).toBe('duplicate-write-target')
    expect(conflicts[0]?.severity).toBe('error')
    expect(conflicts[0]?.entryIds).toEqual(['opcua-robot-start', 'opcua-robot-start-2'])
  })

  it('does not flag two readers of the same internal signal', () => {
    const file: MappingFileV1 = clone(createReferenceCellSampleMapping())
    const source = file.entries.find((entry) => entry.id === 'opcua-cnc-spindle-speed')!
    const readOnly = clone(source)
    readOnly.id = 'mqtt-cnc-spindle-speed'
    readOnly.protocol = 'mqtt'
    readOnly.target = { topic: 'fabrik3d/v1/telemetry', payloadField: 'SpindleSpeed' }
    file.entries.push(readOnly)
    const conflicts = detectMappingConflicts(file)
    expect(conflicts.some((conflict) => conflict.code === 'duplicate-write-target')).toBe(false)
    // Differing protocol/datatype for the same signal is surfaced as a review warning.
    expect(conflicts.some((conflict) => conflict.code === 'incompatible-signal-mapping')).toBe(true)
  })

  it('flags the same internal signal mapped with incompatible directions', () => {
    const file: MappingFileV1 = clone(createReferenceCellSampleMapping())
    const read = file.entries.find((entry) => entry.id === 'opcua-cnc-spindle-speed')!
    const write = clone(read)
    write.id = 'opcua-cnc-spindle-speed-write'
    write.direction = 'write'
    file.entries.push(write)
    const conflicts = detectMappingConflicts(file)
    expect(conflicts.some((conflict) => conflict.code === 'incompatible-signal-mapping')).toBe(true)
  })
})
