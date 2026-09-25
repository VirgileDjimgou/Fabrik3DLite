import { describe, expect, it } from 'vitest'
import { createReferenceCellCatalog } from './testFixtures'
import { serializeMappingFile } from './serialization'
import { validateMappingFile } from './validation'
import { MAPPING_SCHEMA_VERSION, type MappingEntryV1, type MappingFileV1 } from './schema'

/**
 * Recorded performance bound for the documented 500-mapping interaction budget.
 * The threshold is deliberately generous so it is a regression guard rather than
 * a brittle micro-benchmark; the measured duration is reported for evidence.
 */
describe('mapping performance budget', () => {
  const signals: Array<{ id: string; equipmentId: string; writable: boolean }> = [
    { id: 'cnc-1.SpindleSpeed', equipmentId: 'cnc-1', writable: false },
    { id: 'cnc-1.FeedRate', equipmentId: 'cnc-1', writable: false },
    { id: 'cnc-1.CycleStart', equipmentId: 'cnc-1', writable: true },
    { id: 'robot-1.Start', equipmentId: 'robot-1', writable: true },
    { id: 'conveyor-1.ActualSpeed', equipmentId: 'conveyor-1', writable: false },
    { id: 'conveyor-1.RunCommand', equipmentId: 'conveyor-1', writable: true },
  ]

  function buildFile(count: number): MappingFileV1 {
    const entries: MappingEntryV1[] = []
    for (let index = 0; index < count; index++) {
      const signal = signals[index % signals.length]!
      entries.push({
        id: `perf-${String(index).padStart(4, '0')}`,
        name: `Performance mapping ${index}`,
        protocol: 'opcua',
        internalSignalId: signal.id,
        equipmentId: signal.equipmentId,
        direction: signal.writable ? 'write' : 'read',
        dataType: signal.writable ? 'bool' : 'float',
        scale: 1,
        offset: 0,
        enabled: true,
        target: { nodeId: `ns=2;s=Fabrik3D/Perf/${index}` },
      })
    }
    return { schemaVersion: MAPPING_SCHEMA_VERSION, id: 'performance', name: 'Performance', entries }
  }

  it('validates and serializes 500 mappings within the recorded bound', () => {
    const file = buildFile(500)
    const catalog = createReferenceCellCatalog()

    const start = performance.now()
    const diagnostics = validateMappingFile(file, catalog)
    const serialized = serializeMappingFile(file)
    const elapsedMs = performance.now() - start

    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(serialized.length).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(2000)
    // eslint-disable-next-line no-console
    console.info(`[mapping] validated+serialized 500 mappings in ${elapsedMs.toFixed(1)} ms`)
  })
})
