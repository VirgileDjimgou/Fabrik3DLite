import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from './ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from './sceneBinding'

const catalog = createDefaultScenePresetCatalog()

function testRuntime(): EquipmentAssetRuntime {
  const loadAsync = vi.fn(async () => { throw new Error('offline test runtime') })
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
}

function bindingFor(scenarioId: string) {
  return resolveScenarioSceneBinding(scenarioId, catalog)
}

describe('S58 ScenarioRuntimeHost', () => {
  it('loads one visual per cell equipment instance from the shared asset runtime', async () => {
    const runtime = testRuntime()
    const host = new ScenarioRuntimeHost({ assetRuntime: runtime, now: () => 0 })
    const binding = bindingFor('sorting-normal-cycle')
    host.bind(binding)

    const metrics = await host.loadVisuals()
    expect(host.state).toBe('ready')
    expect(metrics.equipmentCount).toBe(binding.cell.equipment.length)
    expect(host.root.children).toHaveLength(binding.cell.equipment.length)
    expect(metrics.meshes).toBeGreaterThan(0)
    expect(metrics.triangles).toBeGreaterThan(0)
    expect(metrics.loadMs).toBe(0)
    expect(host.equipmentVisuals.every(visual => visual.source === 'procedural')).toBe(true)
    expect(host.equipmentVisuals.every(visual => visual.object.userData.known === true)).toBe(true)

    host.dispose()
    expect(host.root.children).toHaveLength(0)
    expect(runtime.diagnostics().releases).toBe(binding.cell.equipment.length)
    host.dispose()
    expect(runtime.diagnostics().releases).toBe(binding.cell.equipment.length)
  })

  it('initializes, runs and recovers a deterministic scenario state', () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(bindingFor('sorting-normal-cycle'))
    expect(host.progress()).toMatchObject({ status: 'idle', progressPercent: 0 })

    const running = host.run()
    expect(running.status).toBe('running')
    expect(running.completedCount).toBe(2)
    expect(running.currentActivityId).toBe('recovery')

    const completed = host.recover()
    expect(completed.status).toBe('completed')
    expect(completed.progressPercent).toBe(100)
    host.dispose()
  })

  it('places the camera from scenario/scene data', () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    const binding = bindingFor('robot-safety-training')
    host.bind(binding)
    const camera = new THREE.PerspectiveCamera()
    const target = host.placeCamera(camera)
    expect(camera.position.x).toBeCloseTo(binding.camera.position.x)
    expect(camera.position.y).toBeCloseTo(binding.camera.position.y)
    expect(camera.position.z).toBeCloseTo(binding.camera.position.z)
    expect(target).toEqual(binding.camera.target)
    host.dispose()
  })

  it('swaps cells deterministically and keeps the resource count bounded', async () => {
    const runtime = testRuntime()
    const host = new ScenarioRuntimeHost({ assetRuntime: runtime, now: () => 0 })
    const first = bindingFor('sorting-normal-cycle')
    const second = bindingFor('safety-door-recovery')

    await host.switch(first)
    expect(host.root.children).toHaveLength(first.cell.equipment.length)

    const alternate = [first, second]
    for (let index = 0; index < 6; index += 1) {
      await host.switch(alternate[index % 2]!)
      const expected = alternate[index % 2]!.cell.equipment.length
      expect(host.root.children).toHaveLength(expected)
    }
    const maxCount = Math.max(first.cell.equipment.length, second.cell.equipment.length)
    expect(host.root.children.length).toBeLessThanOrEqual(maxCount)
    expect(runtime.diagnostics().releases).toBeGreaterThanOrEqual(first.cell.equipment.length + second.cell.equipment.length)
    host.dispose()
  })

  it('degrades unknown equipment classes to the generic procedural visual with a diagnostic', async () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    const binding = bindingFor('pallet-processing')
    host.bind(binding)
    const metrics = await host.loadVisuals()
    expect(metrics.equipmentCount).toBe(binding.cell.equipment.length)
    expect(host.equipmentVisuals.some(visual => visual.object.userData.known === false)).toBe(true)
    host.dispose()
  })
})
