import { describe, expect, it, vi } from 'vitest'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import {
  EQUIPMENT_SDK_VERSION,
  MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  createTransform,
  definitionLookupFrom,
  type CellDefinition,
} from '../equipment'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS } from '../safety'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from './ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from './sceneBinding'

const lookup = definitionLookupFrom([
  ...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  ...INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS,
])

function testRuntime(): EquipmentAssetRuntime {
  const loadAsync = vi.fn(async () => { throw new Error('offline attachment runtime') })
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
}

describe('S73 runtime attachment integration', () => {
  it('positions attached equipment from declared anchors and exposes diagnostics', async () => {
    const cell: CellDefinition = {
      sdkVersion: EQUIPMENT_SDK_VERSION,
      id: 'runtime-attachment-cell',
      name: 'Runtime attachment cell',
      worldFrameId: 'world',
      equipment: [
        { id: 'conveyor-a', definitionId: 'straight-conveyor', transform: createTransform({ x: 0, y: 0, z: 0 }) },
        { id: 'conveyor-b', definitionId: 'straight-conveyor', transform: createTransform({ x: 0, y: 0, z: 0 }), attachTo: { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
        { id: 'broken-1', definitionId: 'vacuum-gripper', transform: createTransform({ x: 5, y: 6, z: 7 }), attachTo: { targetId: 'missing-robot', anchorId: 'tool:flange' } },
      ],
    }
    const base = resolveScenarioSceneBinding('palletizing-normal-cycle', createDefaultScenePresetCatalog())
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0, definitionLookup: lookup })
    host.bind({ ...base, cell })
    await host.loadVisuals()

    const conveyorB = host.equipmentVisuals.find((visual) => visual.equipmentId === 'conveyor-b')!.object
    expect(conveyorB.position.x).toBeCloseTo(2, 9)

    // The invalid attachment fails closed to the declared transform with a diagnostic.
    const broken = host.equipmentVisuals.find((visual) => visual.equipmentId === 'broken-1')!.object
    expect(broken.position.x).toBeCloseTo(5, 9)
    expect(broken.position.y).toBeCloseTo(6, 9)
    expect(broken.position.z).toBeCloseTo(7, 9)
    expect(host.attachmentDiagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown_target_instance')

    host.dispose()
  })
})
