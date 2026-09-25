import { describe, expect, it } from 'vitest'
import { createReferenceCellSampleMapping } from './sampleMapping'
import { MAX_MAPPING_FILE_BYTES, parseMappingFile, roundTripMappingFile, serializeMappingFile } from './serialization'
import { MappingFileError } from './diagnostics'

describe('serializeMappingFile', () => {
  it('is deterministic regardless of entry order', () => {
    const file = createReferenceCellSampleMapping()
    const shuffled = { ...file, entries: [...file.entries].reverse() }
    expect(serializeMappingFile(shuffled)).toBe(serializeMappingFile(file))
  })

  it('sorts entries by id and writes no timestamp', () => {
    const text = serializeMappingFile(createReferenceCellSampleMapping())
    const parsed = JSON.parse(text) as { entries: Array<{ id: string }> }
    const ids = parsed.entries.map((entry) => entry.id)
    expect(ids).toEqual([...ids].sort())
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('round-trips exactly', () => {
    const file = createReferenceCellSampleMapping()
    const text = serializeMappingFile(file)
    const reparsed = parseMappingFile(text)
    expect(serializeMappingFile(reparsed.file)).toBe(text)
    expect(reparsed.migrated).toBe(false)
  })

  it('reports a stable round-trip diagnostic', () => {
    const result = roundTripMappingFile(serializeMappingFile(createReferenceCellSampleMapping()))
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'round-trip-stable')).toBe(true)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'round-trip-mismatch')).toBe(false)
  })
})

describe('parseMappingFile', () => {
  it('rejects oversized files before parsing', () => {
    const oversized = ' '.repeat(MAX_MAPPING_FILE_BYTES + 1)
    expect(() => parseMappingFile(oversized)).toThrowError(MappingFileError)
  })

  it('rejects non-JSON text', () => {
    expect(() => parseMappingFile('{not json')).toThrowError(MappingFileError)
  })

  it('rejects an unsupported schema version', () => {
    expect(() => parseMappingFile(JSON.stringify({ schemaVersion: '5.0', entries: [] }))).toThrowError(MappingFileError)
  })
})
