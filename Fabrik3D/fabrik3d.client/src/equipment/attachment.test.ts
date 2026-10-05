import { describe, expect, it } from 'vitest'
import {
  MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  applyCellAttachments,
  createTransform,
  definitionLookupFrom,
  resolveCellAttachments,
} from './index'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS } from '../safety'
import { EQUIPMENT_SDK_VERSION, type CellDefinition, type EquipmentInstance } from './types'

const lookup = definitionLookupFrom([
  ...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  ...INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS,
])

function instance(id: string, definitionId: string, x = 0, y = 0, z = 0, attachTo?: EquipmentInstance['attachTo']): EquipmentInstance {
  return { id, definitionId, transform: createTransform({ x, y, z }), ...(attachTo ? { attachTo } : {}) }
}

function cell(equipment: EquipmentInstance[]): CellDefinition {
  return { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'test-cell', name: 'Test cell', worldFrameId: 'world', equipment }
}

function positionOf(resolution: ReturnType<typeof resolveCellAttachments>, id: string) {
  return resolution.byEquipmentId.get(id)!.transform.position
}

function expectPosition(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
  expect(actual.z).toBeCloseTo(expected.z, 9)
}

describe('S73 anchor-driven attachment resolution', () => {
  it('chains conveyors end to end from declared anchors', () => {
    const resolution = resolveCellAttachments(cell([
      instance('conveyor-a', 'straight-conveyor'),
      instance('conveyor-b', 'straight-conveyor', 0, 0, 0, { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
      instance('conveyor-c', 'straight-conveyor', 0, 0, 0, { targetId: 'conveyor-b', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
    ]), lookup)

    expect(resolution.diagnostics).toEqual([])
    expectPosition(positionOf(resolution, 'conveyor-a'), { x: 0, y: 0, z: 0 })
    expectPosition(positionOf(resolution, 'conveyor-b'), { x: 2, y: 0, z: 0 })
    expectPosition(positionOf(resolution, 'conveyor-c'), { x: 4, y: 0, z: 0 })
    expect(resolution.byEquipmentId.get('conveyor-b')!.attached).toBe(true)
    expect(resolution.byEquipmentId.get('conveyor-b')!.fallback).toBe(false)
  })

  it('composes a fence run with an interlocked gate', () => {
    const resolution = resolveCellAttachments(cell([
      instance('fence-1', 'fence-panel', -3, 0, -3),
      instance('fence-2', 'fence-panel', 0, 0, 0, { targetId: 'fence-1', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
      instance('gate-1', 'interlocked-gate', 0, 0, 0, { targetId: 'fence-2', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
    ]), lookup)

    expect(resolution.diagnostics).toEqual([])
    expectPosition(positionOf(resolution, 'fence-2'), { x: -0.6, y: 0, z: -3 })
    expectPosition(positionOf(resolution, 'gate-1'), { x: 1.2, y: 0, z: -3 })
  })

  it('attaches a tool to the robot tool:flange anchor', () => {
    const resolution = resolveCellAttachments(cell([
      instance('robot-1', 'fanuc-like-6axis', 0, 0, 3),
      instance('gripper-1', 'vacuum-gripper', 0, 0, 0, { targetId: 'robot-1', anchorId: 'tool:flange' }),
    ]), lookup)

    expect(resolution.diagnostics).toEqual([])
    expectPosition(positionOf(resolution, 'gripper-1'), { x: 0, y: 1.35, z: 3.35 })
  })

  it('attaches a pallet station to a conveyor material port with a compatible-port check', () => {
    const resolution = resolveCellAttachments(cell([
      instance('conveyor-a', 'straight-conveyor'),
      instance('pallet-station-1', 'pallet-station', 0, 0, 0, { targetId: 'conveyor-a', portId: 'material-out' }),
    ]), lookup)

    expect(resolution.diagnostics).toEqual([])
    expectPosition(positionOf(resolution, 'pallet-station-1'), { x: 1, y: 0, z: 0 })
  })

  it('fails closed to the declared transform when the target instance is missing', () => {
    const resolution = resolveCellAttachments(cell([
      instance('gripper-1', 'vacuum-gripper', 7, 8, 9, { targetId: 'missing-robot', anchorId: 'tool:flange' }),
    ]), lookup)

    expect(resolution.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown_target_instance')
    const placement = resolution.byEquipmentId.get('gripper-1')!
    expect(placement.fallback).toBe(true)
    expectPosition(placement.transform.position, { x: 7, y: 8, z: 9 })
  })

  it('fails closed when the target anchor is unknown', () => {
    const resolution = resolveCellAttachments(cell([
      instance('robot-1', 'fanuc-like-6axis'),
      instance('gripper-1', 'vacuum-gripper', 1, 2, 3, { targetId: 'robot-1', anchorId: 'tool:missing' }),
    ]), lookup)

    expect(resolution.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown_target_anchor')
    expectPosition(resolution.byEquipmentId.get('gripper-1')!.transform.position, { x: 1, y: 2, z: 3 })
  })

  it('fails closed when the ports are incompatible', () => {
    const resolution = resolveCellAttachments(cell([
      instance('conveyor-a', 'straight-conveyor'),
      instance('sensor-1', 'photoelectric-sensor', 0, 0, 0, { targetId: 'conveyor-a', portId: 'material-out' }),
    ]), lookup)

    expect(resolution.diagnostics.map((diagnostic) => diagnostic.code)).toContain('incompatible_ports')
    expect(resolution.byEquipmentId.get('sensor-1')!.fallback).toBe(true)
  })

  it('detects attachment cycles and keeps the declared transforms', () => {
    const resolution = resolveCellAttachments(cell([
      instance('a', 'straight-conveyor', 1, 0, 0, { targetId: 'b', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
      instance('b', 'straight-conveyor', 2, 0, 0, { targetId: 'a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
    ]), lookup)

    expect(resolution.diagnostics.map((diagnostic) => diagnostic.code)).toContain('attachment_cycle')
  })

  it('attaches to a declared world/infrastructure anchor', () => {
    const resolution = resolveCellAttachments(
      cell([instance('cabinet-1', 'plc-cabinet', 0, 0, 0, { targetId: 'anchor:operator.station' })]),
      lookup,
      { worldAnchors: [{ id: 'anchor:operator.station', position: { x: 3.8, y: 0, z: 3.1 } }] },
    )

    expect(resolution.diagnostics).toEqual([])
    expectPosition(positionOf(resolution, 'cabinet-1'), { x: 3.8, y: 0, z: 3.1 })
  })

  it('is deterministic and idempotent when applied twice', () => {
    const source = cell([
      instance('conveyor-a', 'straight-conveyor'),
      instance('conveyor-b', 'straight-conveyor', 0, 0, 0, { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' }),
    ])
    const first = applyCellAttachments(source, lookup)
    const second = applyCellAttachments(first.cell, lookup)
    expect(second.cell).toEqual(first.cell)
    expect(second.resolution.diagnostics).toEqual([])
  })
})
