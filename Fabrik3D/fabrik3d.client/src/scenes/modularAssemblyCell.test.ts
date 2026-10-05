import { describe, expect, it } from 'vitest'
import {
  MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  SINGLE_CONVEYOR_CELL,
  SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  definitionLookupFrom,
  resolveCellAttachments,
  type CellDefinition,
} from '../equipment'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS } from '../safety'
import {
  ASSEMBLY_INSPECTION_CELL,
  MODULAR_ASSEMBLY_CELL,
  PALLETIZING_CELL,
  SAFETY_TRAINING_CELL,
  VISION_SORTING_CELL,
} from './materialFlowCells'

const lookup = definitionLookupFrom([
  ...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  ...INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS,
])

function positionOf(cell: CellDefinition, id: string) {
  return resolveCellAttachments(cell, lookup).byEquipmentId.get(id)!.transform.position
}

function expectPosition(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
  expect(actual.z).toBeCloseTo(expected.z, 9)
}

describe('S73 modular assembly cell', () => {
  it('composes every attached instance from declared anchors/ports with no hard-coded transform', () => {
    const resolution = resolveCellAttachments(MODULAR_ASSEMBLY_CELL, lookup)
    expect(resolution.diagnostics).toEqual([])

    // Attached instances declare only an origin fallback; placement is derived.
    for (const id of ['conveyor-b', 'conveyor-c', 'gripper-1', 'fence-2', 'gate-1', 'pallet-station-1']) {
      const declared = MODULAR_ASSEMBLY_CELL.equipment.find((instance) => instance.id === id)!
      expect(declared.transform.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(resolution.byEquipmentId.get(id)!.attached).toBe(true)
      expect(resolution.byEquipmentId.get(id)!.fallback).toBe(false)
    }

    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'conveyor-b'), { x: 2, y: 0, z: 0 })
    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'conveyor-c'), { x: 4, y: 0, z: 0 })
    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'gripper-1'), { x: 0, y: 1.35, z: 3.35 })
    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'fence-2'), { x: -0.6, y: 0, z: -3 })
    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'gate-1'), { x: 1.2, y: 0, z: -3 })
    expectPosition(positionOf(MODULAR_ASSEMBLY_CELL, 'pallet-station-1'), { x: 1, y: 0, z: 0 })
  })
})

describe('S73 flagship cell regression', () => {
  const flagshipCells: Array<[string, CellDefinition]> = [
    ['vision-sorting', VISION_SORTING_CELL],
    ['palletizing', PALLETIZING_CELL],
    ['assembly-inspection', ASSEMBLY_INSPECTION_CELL],
    ['safety-training', SAFETY_TRAINING_CELL],
    ['cnc-reference', SINGLE_CONVEYOR_CELL],
  ]

  it.each(flagshipCells)('%s resolves every instance to its declared transform', (_name, cell) => {
    const resolution = resolveCellAttachments(cell, lookup)
    expect(resolution.diagnostics).toEqual([])
    for (const instance of cell.equipment) {
      const resolved = resolution.byEquipmentId.get(instance.id)!.transform
      expect(resolved.position.x).toBeCloseTo(instance.transform.position.x, 9)
      expect(resolved.position.y).toBeCloseTo(instance.transform.position.y, 9)
      expect(resolved.position.z).toBeCloseTo(instance.transform.position.z, 9)
      expect(resolved.rotation.y).toBeCloseTo(instance.transform.rotation.y, 9)
    }
  })
})
