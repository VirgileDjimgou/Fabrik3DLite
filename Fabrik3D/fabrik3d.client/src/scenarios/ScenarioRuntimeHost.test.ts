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

/** Equipment children only; the S68 factory environment is a separate child. */
function equipmentChildren(host: ScenarioRuntimeHost): THREE.Object3D[] {
  return host.root.children.filter((child) => typeof child.userData.equipmentId === 'string')
}

function environmentChildren(host: ScenarioRuntimeHost): THREE.Object3D[] {
  return host.root.children.filter((child) => child.name.startsWith('FactoryEnvironment:'))
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
    expect(equipmentChildren(host)).toHaveLength(binding.cell.equipment.length)
    expect(environmentChildren(host)).toHaveLength(1)
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
    const binding = bindingFor('sorting-normal-cycle')
    host.bind(binding)
    expect(host.progress()).toMatchObject({ status: 'idle', progressPercent: 0 })

    const running = host.run()
    expect(running.status).toBe('running')
    expect(running.totalActivities).toBe(binding.scenario!.activities.length)
    expect(running.completedCount).toBe(binding.scenario!.activities.length - 1)
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

  it('places the derived operator and workcell camera views deterministically', () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    const binding = bindingFor('robot-palletizing')
    host.bind(binding)
    const camera = new THREE.PerspectiveCamera()

    const overview = host.placeCamera(camera, 'overview')
    expect(overview).toEqual(binding.cameraPresets.overview!.target)
    expect(camera.position.x).toBeCloseTo(binding.cameraPresets.overview!.position.x)

    const operator = host.placeCamera(camera, 'operator')
    expect(operator).toEqual(binding.cameraPresets.operator!.target)
    expect(camera.position.z).toBeCloseTo(binding.cameraPresets.operator!.position.z)

    const workcell = host.placeCamera(camera, 'workcell')
    expect(workcell).toEqual(binding.cameraPresets.workcell!.target)

    // An unknown view falls back to the primary default rather than leaving the camera unpositioned.
    const fallback = host.placeCamera(camera, 'unknown' as never)
    expect(fallback).toEqual(binding.camera.target)
    host.dispose()
  })

  it('swaps cells deterministically and keeps the resource count bounded', async () => {
    const runtime = testRuntime()
    const host = new ScenarioRuntimeHost({ assetRuntime: runtime, now: () => 0 })
    const first = bindingFor('sorting-normal-cycle')
    const second = bindingFor('safety-door-recovery')

    await host.switch(first)
    expect(equipmentChildren(host)).toHaveLength(first.cell.equipment.length)
    expect(environmentChildren(host)).toHaveLength(1)

    const alternate = [first, second]
    for (let index = 0; index < 6; index += 1) {
      await host.switch(alternate[index % 2]!)
      const expected = alternate[index % 2]!.cell.equipment.length
      expect(equipmentChildren(host)).toHaveLength(expected)
      expect(environmentChildren(host)).toHaveLength(1)
    }
    const maxCount = Math.max(first.cell.equipment.length, second.cell.equipment.length)
    expect(host.root.children.length).toBeLessThanOrEqual(maxCount + 1)
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

describe('S66 scenario robot motion integration', () => {
  it('drives palletizing J1-J6 motion through the controller and visual binding', async () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(bindingFor('palletizing-normal-cycle'))
    await host.loadVisuals()
    host.run()

    const started = host.robotSnapshot()
    expect(started).not.toBeNull()
    expect(started!.kind).toBe('robot-palletizing')
    expect(started!.profileId).toBe('medium-6axis')
    expect(started!.started).toBe(true)
    expect(host.robotMotionDiagnostic).toBeNull()

    const initial = [...started!.jointAngles]
    let maxDelta = 0
    for (let index = 0; index < 120; index += 1) {
      host.tick(0.1)
      const snapshot = host.robotSnapshot()!
      snapshot.jointAngles.forEach((value, joint) => {
        maxDelta = Math.max(maxDelta, Math.abs(value - initial[joint]!))
      })
    }
    expect(maxDelta).toBeGreaterThan(0.2)
    expect(host.robotSnapshot()!.complete).toBe(true)
    host.dispose()
  })

  it('synchronizes the carried carton with the robot tool frame during palletizing', async () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(bindingFor('palletizing-normal-cycle'))
    await host.loadVisuals()
    host.run()

    let carryingFrames = 0
    for (let index = 0; index < 200; index += 1) {
      host.tick(0.1)
      const snapshot = host.robotSnapshot()!
      if (!snapshot.carrying || !snapshot.toolPosition) continue
      carryingFrames += 1
      const carton = host.equipmentVisuals.find(visual => visual.definitionId === 'carton')!.object
      // Palletizing robot base is at (-0.7, 0, 0.2) with zero yaw.
      expect(carton.position.x).toBeCloseTo(-0.7 + snapshot.toolPosition.x, 6)
      expect(carton.position.y).toBeCloseTo(snapshot.toolPosition.y, 6)
      expect(carton.position.z).toBeCloseTo(0.2 + snapshot.toolPosition.z, 6)
    }
    expect(carryingFrames).toBeGreaterThan(0)
    host.dispose()
  })

  it('loads the assembly fixture and reaches the inspection pose with J1-J6 motion', async () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(bindingFor('assembly-inspection-cycle'))
    await host.loadVisuals()
    host.run()

    const part = host.equipmentVisuals.find(visual => visual.definitionId === 'configurable-part')!.object
    const resting = { x: part.position.x, y: part.position.y, z: part.position.z }
    const phases = new Set<string>()
    let carryingSeen = false
    for (let index = 0; index < 260; index += 1) {
      host.tick(0.1)
      const snapshot = host.robotSnapshot()!
      if (snapshot.phase) phases.add(snapshot.phase)
      if (snapshot.carrying) carryingSeen = true
    }
    expect(phases.has('PICK_PART')).toBe(true)
    expect(phases.has('INSPECTION_POSE')).toBe(true)
    expect(carryingSeen).toBe(true)
    expect(part.position.x).toBeCloseTo(resting.x, 6)
    expect(part.position.y).toBeCloseTo(resting.y, 6)
    expect(part.position.z).toBeCloseTo(resting.z, 6)
    host.dispose()
  })

  it('inhibits safety-cell motion until the existing controlled safety restart is observed', async () => {
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(bindingFor('safety-door-recovery'))
    await host.loadVisuals()

    // The safety exercise starts from an unsafe E-stop/interlock/scanner state.
    const blocked = host.robotSnapshot()!
    expect(blocked.blocked).toBe(true)
    expect(blocked.blockReason).toBe('emergency-stop')
    const held = [...blocked.jointAngles]
    for (let index = 0; index < 30; index += 1) host.tick(0.1)
    expect([...host.robotSnapshot()!.jointAngles]).toEqual(held)

    // The existing controlled restart event (applied by the run program) clears
    // every simulated safety condition before motion is allowed.
    host.run()
    expect(host.robotSnapshot()!.blocked).toBe(false)
    for (let index = 0; index < 25; index += 1) host.tick(0.1)
    expect(host.robotSnapshot()!.jointAngles.some(value => Math.abs(value) > 1e-6)).toBe(true)
    host.dispose()
  })
})
