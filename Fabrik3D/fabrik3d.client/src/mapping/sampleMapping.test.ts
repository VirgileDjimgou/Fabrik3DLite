import { describe, expect, it } from 'vitest'
import { createReferenceCellSampleMapping } from './sampleMapping'
import { createReferenceCellCatalog } from './testFixtures'
import { validateMappingFile } from './validation'
import { serializeMappingFile } from './serialization'

describe('reference-cell sample mapping', () => {
  it('only references signals declared by the reference cell', () => {
    const diagnostics = validateMappingFile(createReferenceCellSampleMapping(), createReferenceCellCatalog())
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    expect(errors).toEqual([])
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'unknown-signal')).toEqual([])
  })

  it('covers opcua, mqtt and modbus with both read and write directions', () => {
    const entries = createReferenceCellSampleMapping().entries
    expect(new Set(entries.map((entry) => entry.protocol))).toEqual(new Set(['opcua', 'mqtt', 'modbus']))
    expect(new Set(entries.map((entry) => entry.direction))).toEqual(new Set(['read', 'write']))
  })

  it('serializes deterministically', () => {
    const file = createReferenceCellSampleMapping()
    expect(serializeMappingFile(file)).toBe(serializeMappingFile(createReferenceCellSampleMapping()))
  })
})
