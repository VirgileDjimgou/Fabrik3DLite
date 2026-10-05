import { describe, expect, it } from 'vitest'
import { fromCellFile, parseCellFile, serializeCellFile, toCellFile } from './importExport'
import { validateCellFile } from './validation'
import { CELL_SCHEMA_VERSION } from './schema'
import { EQUIPMENT_SDK_VERSION, createTransform, type CellDefinition } from '../equipment'

const KNOWN = new Set(['straight-conveyor', 'infeed-buffer', 'vacuum-gripper', 'fanuc-like-6axis'])

const CELL: CellDefinition = {
  sdkVersion: EQUIPMENT_SDK_VERSION,
  id: 'attachment-cell',
  name: 'Attachment cell',
  worldFrameId: 'world',
  equipment: [
    { id: 'conveyor-a', definitionId: 'straight-conveyor', transform: createTransform({ x: 0, y: 0, z: 0 }) },
    {
      id: 'conveyor-b',
      definitionId: 'straight-conveyor',
      transform: createTransform({ x: 0, y: 0, z: 0 }),
      attachTo: { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' },
    },
    {
      id: 'gripper-1',
      definitionId: 'vacuum-gripper',
      transform: createTransform({ x: 0, y: 0, z: 0 }),
      attachTo: { targetId: 'fanuc-like-6axis', anchorId: 'tool:flange' },
    },
  ],
}

describe('S73 cell-file attachment round-trip', () => {
  it('serializes attachTo deterministically and preserves it through parse', () => {
    const file = toCellFile(CELL)
    expect(file.schemaVersion).toBe(CELL_SCHEMA_VERSION)
    const text = serializeCellFile(file)
    expect(text).toContain('"attachTo"')

    const parsed = parseCellFile(text, KNOWN)
    expect(parsed.migrated).toBe(false)
    expect(parsed.diagnostics).toEqual([])
    expect(parsed.cell.equipment.find((entry) => entry.id === 'conveyor-b')!.attachTo).toEqual({
      targetId: 'conveyor-a',
      anchorId: 'anchor:out',
      sourceAnchorId: 'anchor:in',
    })
    expect(fromCellFile(parsed.cell)).toEqual(CELL)
  })

  it('reports an actionable diagnostic for an ambiguous attachment', () => {
    const file = toCellFile(CELL)
    const broken = {
      ...file,
      equipment: [{
        ...file.equipment[0]!,
        attachTo: { targetId: 'conveyor-a', anchorId: 'anchor:out', portId: 'material-out' },
      }],
    }
    const diagnostics = validateCellFile(broken, KNOWN)
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('ambiguous_attachment')
  })

  it('reports a missing attachment target', () => {
    const file = toCellFile(CELL)
    const broken = {
      ...file,
      equipment: [{ ...file.equipment[0]!, attachTo: { targetId: '' } }],
    }
    const diagnostics = validateCellFile(broken, KNOWN)
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing_attachment_target')
  })
})
