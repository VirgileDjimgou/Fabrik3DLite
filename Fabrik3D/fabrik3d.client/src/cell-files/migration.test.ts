import { describe, expect, it } from 'vitest'
import { migrateCellFile } from './migration'
import { CellFileError } from './diagnostics'

const LEGACY = JSON.stringify({
  schemaVersion: '0.9',
  cell: { id: 'legacy-cell', name: 'Legacy cell' },
  equipment: [
    { id: 'robot-1', type: 'robot', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'cnc-1', type: 'cnc', position: [0, 0, 3.4], rotation: [0, Math.PI, 0] },
  ],
})

describe('cell file migration from the initial schema', () => {
  it('migrates 0.9 to 1.0 predictably', () => {
    const result = migrateCellFile(LEGACY)

    expect(result.migrated).toBe(true)
    expect(result.cell.schemaVersion).toBe('1.0')
    expect(result.cell.id).toBe('legacy-cell')
    expect(result.cell.name).toBe('Legacy cell')
    expect(result.cell.worldFrameId).toBe('world')
    expect(result.cell.equipment).toHaveLength(2)
    expect(result.diagnostics.some((d) => d.code === 'migrated_from_0.9')).toBe(true)
  })

  it('maps legacy equipment types to current definition ids and object transforms', () => {
    const result = migrateCellFile(LEGACY)
    const robot = result.cell.equipment.find((e) => e.id === 'robot-1')!
    const cnc = result.cell.equipment.find((e) => e.id === 'cnc-1')!

    expect(robot.definitionId).toBe('medium-6axis')
    expect(robot.transform.position).toEqual({ x: 0, y: 0, z: 0 })

    expect(cnc.definitionId).toBe('educational-cnc')
    expect(cnc.transform.position).toEqual({ x: 0, y: 0, z: 3.4 })
    expect(cnc.transform.rotation.y).toBeCloseTo(Math.PI, 9)
  })

  it('migrating an already-current file is a no-op', () => {
    const current = JSON.stringify({ schemaVersion: '1.0', id: 'c', name: 'C', worldFrameId: 'world', equipment: [] })
    const result = migrateCellFile(current)
    expect(result.migrated).toBe(false)
    expect(result.cell.id).toBe('c')
  })

  it('throws with a diagnostic for unsupported versions', () => {
    expect(() => migrateCellFile('{ "schemaVersion": "3.0", "equipment": [] }'))
      .toThrowError('Unsupported cell file')
    expect(() => migrateCellFile('{ "hello": true }')).toThrowError('Unsupported cell file')
    try {
      migrateCellFile('{ "schemaVersion": "3.0" }')
    } catch (error) {
      expect(error).toBeInstanceOf(CellFileError)
      expect((error as CellFileError).diagnostics.some((d) => d.code === 'unsupported_version')).toBe(true)
    }
  })
})