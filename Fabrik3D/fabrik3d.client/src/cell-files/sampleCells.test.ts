import { describe, expect, it } from 'vitest'
import { SAMPLE_CELLS, SAMPLE_CELL_JSON, buildSampleCell } from './sampleCells'
import { serializeCellFile } from './importExport'
import { validateCellFile } from './validation'

const KNOWN = new Set(['compact-6axis', 'medium-6axis', 'heavy-6axis', 'educational-cnc', 'belt-conveyor', 'pallet-station'])

describe('sample cells', () => {
  it.each(['compact-6axis', 'medium-6axis', 'heavy-6axis'] as const)('builds a conformant %s sample', (robotId) => {
    const cell = SAMPLE_CELLS[robotId]
    expect(validateCellFile(cell, KNOWN)).toEqual([])
    expect(cell.equipment.map((e) => e.definitionId)).toContain(robotId)
  })

  it('serializes deterministically for Git review', () => {
    for (const robotId of Object.keys(SAMPLE_CELL_JSON) as Array<keyof typeof SAMPLE_CELL_JSON>) {
      expect(SAMPLE_CELL_JSON[robotId]).toBe(serializeCellFile(buildSampleCell(robotId)))
    }
  })

  it('uses the reference single-conveyor layout across profiles', () => {
    for (const robotId of ['compact-6axis', 'medium-6axis', 'heavy-6axis'] as const) {
      const positions = SAMPLE_CELLS[robotId].equipment.map((e) => e.transform.position)
      const medium = SAMPLE_CELLS['medium-6axis'].equipment.map((e) => e.transform.position)
      expect(positions).toEqual(medium)
    }
  })
})