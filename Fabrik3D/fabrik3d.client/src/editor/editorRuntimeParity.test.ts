import { describe, expect, it, vi } from 'vitest'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import {
  EQUIPMENT_SDK_VERSION,
  MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  createTransform,
  definitionLookupFrom,
  resolveCellAttachments,
  type CellDefinition,
} from '../equipment'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS } from '../safety'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from '../scenarios/ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from '../scenarios/sceneBinding'
import { createEditorCatalog, cellDefinitionToPlacements } from './catalog'

const lookup = definitionLookupFrom([
  ...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  ...INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS,
])

const PARITY_CELL: CellDefinition = {
  sdkVersion: EQUIPMENT_SDK_VERSION,
  id: 'parity-cell',
  name: 'Parity cell',
  worldFrameId: 'world',
  equipment: [
    { id: 'robot-1', definitionId: 'fanuc-like-6axis', transform: createTransform({ x: 0, y: 0, z: 0 }) },
    { id: 'gripper-1', definitionId: 'vacuum-gripper', transform: createTransform({ x: 0, y: 0, z: 0 }), attachTo: { targetId: 'robot-1', anchorId: 'tool:flange' } },
    { id: 'conveyor-a', definitionId: 'straight-conveyor', transform: createTransform({ x: 0, y: 0, z: 0 }) },
    { id: 'conveyor-b', definitionId: 'straight-conveyor', transform: createTransform({ x: 0, y: 0, z: 0 }), attachTo: { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
  ],
}

function testRuntime(): EquipmentAssetRuntime {
  const loadAsync = vi.fn(async () => { throw new Error('offline parity runtime') })
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
}

describe('S73 editor/runtime world-transform parity', () => {
  it('resolves identical world transforms for the same CellDefinition', async () => {
    const resolved = resolveCellAttachments(PARITY_CELL, lookup)
    expect(resolved.diagnostics).toEqual([])

    const catalog = createEditorCatalog(createDefaultRobotCatalog())
    const { placements } = cellDefinitionToPlacements(PARITY_CELL, catalog)
    // The editor catalog does not carry the scenario robot class, so the robot
    // is skipped; every attached instance is compared.
    expect(placements.map((placement) => placement.id)).toEqual(['gripper-1', 'conveyor-a', 'conveyor-b'])

    const base = resolveScenarioSceneBinding('palletizing-normal-cycle', createDefaultScenePresetCatalog())
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0, definitionLookup: lookup })
    host.bind({ ...base, cell: PARITY_CELL })
    await host.loadVisuals()
    expect(host.attachmentDiagnostics).toEqual([])

    for (const placement of placements) {
      const expected = resolved.byEquipmentId.get(placement.id)!.transform
      expect(placement.x).toBeCloseTo(expected.position.x, 9)
      expect(placement.z).toBeCloseTo(expected.position.z, 9)
      expect(placement.rotationRad).toBeCloseTo(expected.rotation.y, 9)

      const visual = host.equipmentVisuals.find((candidate) => candidate.equipmentId === placement.id)!
      expect(visual.object.position.x).toBeCloseTo(expected.position.x, 9)
      expect(visual.object.position.y).toBeCloseTo(expected.position.y, 9)
      expect(visual.object.position.z).toBeCloseTo(expected.position.z, 9)
      expect(visual.object.rotation.y).toBeCloseTo(expected.rotation.y, 9)
    }

    host.dispose()
  })
})
