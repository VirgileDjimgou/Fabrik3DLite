import { describe, expect, it } from 'vitest'
import { createDefaultRobotCatalog, ROBOT_PROFILES } from '../robot/catalog'
import { createEditorCatalog } from './catalog'
import { CellEditorModel } from './cellEditorModel'
import { buildReferencePlacements } from './referenceCell'

const catalog = createEditorCatalog(createDefaultRobotCatalog())

function model(initial = buildReferencePlacements(catalog)) {
  return new CellEditorModel(catalog, initial)
}

describe('CellEditorModel', () => {
  it('loads the reference template with robot, cnc, conveyor and pallet', () => {
    const editor = model()
    const kinds = editor.getPlacements().map((p) => p.kind)
    expect(kinds).toEqual(expect.arrayContaining(['robot', 'cnc', 'conveyor', 'pallet-station']))
    expect(editor.getOverlaps().filter((r) => r.invalid)).toHaveLength(0)
  })

  it('recreates the reference cell by adding equipment without editing source', () => {
    const editor = new CellEditorModel(catalog)
    editor.add('robot', 0, 0)
    editor.add('cnc', 0, 3.4)
    const cncId = editor.getSelectionId()!
    editor.rotate(cncId, Math.PI, true)
    editor.add('conveyor', 0, -2.4)
    editor.add('pallet-station', 0, -2.4)

    const reference = buildReferencePlacements(catalog)
    // Geometry (kind + footprint centre) matches the reference exactly.
    const geometry = (p: { kind: string; x: number; z: number }) => ({ kind: p.kind, x: p.x, z: p.z })
    expect(editor.getPlacements().map(geometry)).toEqual(reference.map(geometry))
    // The CNC can be rotated to face the robot (reference rotation is π).
    const cnc = editor.getPlacements().find((p) => p.kind === 'cnc')!
    expect(cnc.rotationRad).toBeCloseTo(Math.PI, 4)
  })

  it('adds and selects equipment from the catalog', () => {
    const editor = model()
    const before = editor.getPlacements().length
    expect(editor.add('safety-zone', 1, 1).ok).toBe(true)
    const added = editor.getPlacements()[editor.getPlacements().length - 1]!
    expect(added.kind).toBe('safety-zone')
    expect(editor.getSelectionId()).toBe(added.id)
    expect(editor.getPlacements()).toHaveLength(before + 1)
  })

  it('inserts, moves, rotates, and exports a static infrastructure module', () => {
    const editor = model()
    expect(editor.add('plc-cabinet', 2.04, 1.96).ok).toBe(true)
    const cabinet = editor.getSelected()!
    expect(cabinet.x).toBeCloseTo(2, 9)
    expect(editor.rotate(cabinet.id, Math.PI / 2).ok).toBe(true)
    expect(editor.move(cabinet.id, 2.5, 2.5).ok).toBe(true)
    expect(editor.toCellDefinition().equipment.find(item => item.id === cabinet.id)?.definitionId).toBe('plc-cabinet')
  })

  it('removes equipment and clears the selection', () => {
    const editor = model()
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!
    editor.select(robot.id)
    expect(editor.remove(robot.id).ok).toBe(true)
    expect(editor.getPlacement(robot.id)).toBeNull()
    expect(editor.getSelectionId()).toBeNull()
  })

  it('moves equipment with grid snapping', () => {
    const editor = model()
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!
    expect(editor.move(robot.id, 0.37, -0.12).ok).toBe(true)
    const moved = editor.getPlacement(robot.id)!
    expect(moved.x).toBeCloseTo(0.4, 9)
    expect(moved.z).toBeCloseTo(-0.1, 9)
  })

  it('rotates equipment with angle snapping', () => {
    const editor = model()
    const cnc = editor.getPlacements().find((p) => p.kind === 'cnc')!
    // 45° snaps to the 15° grid as 45°.
    expect(editor.rotate(cnc.id, Math.PI / 4, true).ok).toBe(true)
    expect(editor.getPlacement(cnc.id)!.rotationRad).toBeCloseTo(Math.PI / 4, 4)
  })

  it('supports undo and redo across commands', () => {
    const editor = model()
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!
    const originalX = robot.x

    editor.move(robot.id, originalX + 1, 0)
    expect(editor.getPlacement(robot.id)!.x).toBeCloseTo(originalX + 1, 9)

    expect(editor.undo()).toBe(true)
    expect(editor.getPlacement(robot.id)!.x).toBeCloseTo(originalX, 9)

    expect(editor.redo()).toBe(true)
    expect(editor.getPlacement(robot.id)!.x).toBeCloseTo(originalX + 1, 9)
  })

  it('rejects edits in execution mode without an explicit transition', () => {
    const editor = model()
    editor.setMode('execution')
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!

    expect(editor.move(robot.id, 1, 1).ok).toBe(false)
    expect(editor.add('cnc', 5, 5).ok).toBe(false)
    expect(editor.remove(robot.id).ok).toBe(false)
    expect(editor.rotate(robot.id, 0.5).ok).toBe(false)
    // Nothing changed.
    expect(editor.getPlacement(robot.id)!.x).toBeCloseTo(0, 9)

    // Explicit transition back to editing enables mutations.
    editor.setMode('editing')
    expect(editor.move(robot.id, 1, 1).ok).toBe(true)
  })

  it('resets to the reference cell (undoable)', () => {
    const editor = model()
    editor.add('safety-zone', 5, 5)
    editor.remove('cnc-1')
    expect(editor.getPlacements().some((p) => p.kind === 'cnc')).toBe(false)

    expect(editor.reset().ok).toBe(true)
    expect(editor.getPlacements().some((p) => p.kind === 'cnc')).toBe(true)
    expect(editor.getOverlaps().filter((r) => r.invalid)).toHaveLength(0)

    expect(editor.undo()).toBe(true)
    expect(editor.getPlacements().some((p) => p.kind === 'cnc')).toBe(false)
  })

  it('reports invalid overlaps and clears them after fixing the placement', () => {
    const editor = model()
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!
    const cnc = editor.getPlacements().find((p) => p.kind === 'cnc')!
    // Move the CNC onto the robot.
    editor.move(cnc.id, robot.x, robot.z)
    expect(editor.isInvalid(cnc.id)).toBe(true)
    expect(editor.isInvalid(robot.id)).toBe(true)

    editor.move(cnc.id, 0, 3.4)
    expect(editor.isInvalid(cnc.id)).toBe(false)
  })

  it('exports a valid equipment-SDK cell definition', () => {
    const editor = model()
    const cell = editor.toCellDefinition()
    expect(cell.sdkVersion).toBe('1.0')
    expect(cell.equipment).toHaveLength(editor.getPlacements().length)
    const robot = cell.equipment.find((e) => e.id === 'robot-1')!
    expect(robot.transform.position).toMatchObject({ x: 0, z: 0 })
    expect(robot.definitionId).toBe('medium-6axis')
  })

  it('validates typed semantic links and retains a valid connection on export', () => {
    const catalog = createEditorCatalog(createDefaultRobotCatalog())
    const editor = new CellEditorModel(catalog)
    editor.add('straight-conveyor', -1, 0)
    const from = editor.getSelected()!.id
    editor.add('infeed-buffer', 1, 0)
    const to = editor.getSelected()!.id
    expect(editor.compatibleTargets(from, 'material-out')).toContainEqual({ equipmentId: to, portId: 'material-in' })
    expect(editor.connect({ id: 'flow-1', fromEquipmentId: from, fromPortId: 'material-out', toEquipmentId: to, toPortId: 'material-in', kind: 'material' })).toEqual({ ok: true })
    expect(editor.connect({ id: 'bad-flow', fromEquipmentId: from, fromPortId: 'material-in', toEquipmentId: to, toPortId: 'material-out', kind: 'material' }).ok).toBe(false)
    expect(editor.toCellDefinition().connections).toHaveLength(1)
    expect(editor.undo()).toBe(true)
    expect(editor.getConnections()).toHaveLength(0)
    expect(editor.redo()).toBe(true)
    expect(editor.getConnections()).toHaveLength(1)
  })

  it('keeps the catalog robot reach metadata on placements', () => {
    const editor = model()
    const robot = editor.getPlacements().find((p) => p.kind === 'robot')!
    expect(robot.reachMeters).toBeGreaterThan(0)
    // Reference reach matches the safety model envelope.
    const medium = ROBOT_PROFILES.find((r) => r.id === 'medium-6axis')!
    expect(robot.reachMeters).toBeGreaterThan(medium.reachMeters)
  })
})
