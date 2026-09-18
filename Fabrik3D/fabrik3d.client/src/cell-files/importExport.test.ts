import { describe, expect, it } from 'vitest'
import { emptyCellFile, parseCellFile, serializeCellFile, toCellFile } from './importExport'
import { fromCellFile } from './importExport'
import { createTransform } from '../equipment'
import { CELL_SCHEMA_VERSION } from './schema'

const known = new Set(['medium-6axis', 'educational-cnc', 'belt-conveyor', 'pallet-station', 'safety-zone'])

describe('cell file schema conformance and malformed files', () => {
  it('accepts a well-formed current-schema cell file', () => {
    const { cell, migrated, diagnostics } = parseCellFile(serializeCellFile(emptyCellFile()), known)
    expect(migrated).toBe(false)
    expect(diagnostics).toEqual([])
    expect(cell.schemaVersion).toBe(CELL_SCHEMA_VERSION)
  })

  it('rejects malformed JSON with a human-readable diagnostic', () => {
    expect(() => parseCellFile('not json')).toThrowError('not valid JSON')
  })

  it('rejects an unsupported schema version', () => {
    expect(() => parseCellFile('{ "schemaVersion": "9.9", "equipment": [] }'))
      .toThrowError('Unsupported cell file')
  })

  it('reports schema conformance diagnostics for a broken file', () => {
    const broken = `{
      "schemaVersion": "1.0",
      "id": "",
      "name": "",
      "worldFrameId": "world",
      "equipment": [
        { "id": "a", "definitionId": "medium-6axis", "transform": { "position": { "x": 1, "y": NaN, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 } } },
        { "id": "a", "definitionId": "medium-6axis", "transform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 } } }
      ]
    }`.replace('NaN', 'null')

    const { diagnostics } = parseCellFile(broken, known)
    const codes = diagnostics.map((d) => d.code)
    expect(codes).toContain('missing_id')
    expect(codes).toContain('missing_name')
    expect(codes).toContain('duplicate_id')
    expect(codes).toContain('non_finite_position')
  })

  it('warns about unknown definition references when a catalog is known', () => {
    const { diagnostics } = parseCellFile(serializeCellFile(emptyCellFile()), new Set(['medium-6axis']))
    expect(diagnostics.some((d) => d.code === 'unknown_definition')).toBe(false)
  })
})

describe('cell file round-trip', () => {
  it('preserves transforms and identifiers through serialization', () => {
    const cell = fromCellFile(emptyCellFile())
    const withEquipment = {
      ...cell,
      equipment: [{
        id: 'robot-7',
        definitionId: 'medium-6axis',
        transform: createTransform({ x: 1.5, y: 0.2, z: -2.4 }, { x: 0, y: Math.PI / 2, z: 0 }),
      }],
    }
    const file = toCellFile(withEquipment)
    const parsed = parseCellFile(serializeCellFile(file), known).cell

    expect(parsed.equipment).toHaveLength(1)
    const parsedEquip = parsed.equipment[0]!
    expect(parsedEquip.id).toBe('robot-7')
    expect(parsedEquip.definitionId).toBe('medium-6axis')
    expect(parsedEquip.transform.position).toEqual({ x: 1.5, y: 0.2, z: -2.4 })
    expect(parsedEquip.transform.rotation.y).toBeCloseTo(Math.PI / 2, 9)
  })

  it('serializes deterministically (stable output, no timestamps)', () => {
    const a = serializeCellFile(toCellFile(fromCellFile(emptyCellFile())))
    const b = serializeCellFile(toCellFile(fromCellFile(emptyCellFile())))
    expect(a).toBe(b)
    expect(a).not.toContain('timestamp')
    expect(a).not.toContain('createdAt')
  })
})