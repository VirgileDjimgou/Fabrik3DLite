import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { createMaterialFlowVisual } from '../equipment/visuals/materialFlowVisuals'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from './ScenarioRuntimeHost'
import { ScenarioCellAnimator, type AnimatableEquipment } from './ScenarioCellAnimator'
import { SCENARIO_CELL_REQUIREMENTS, type ScenarioCellKind } from './cellComposition'
import { createCellVisualState, reduceCellVisualState } from './cellVisualState'
import { resolveScenarioSceneBinding } from './sceneBinding'
import { getScenario } from './catalog'

function equipmentFor(kind: ScenarioCellKind): AnimatableEquipment[] {
  const list: AnimatableEquipment[] = []
  for (const requirement of SCENARIO_CELL_REQUIREMENTS[kind]) {
    for (let index = 0; index < requirement.minCount; index += 1) {
      list.push({
        equipmentId: `${requirement.definitionId}-${index + 1}`,
        definitionId: requirement.definitionId,
        object: createMaterialFlowVisual(requirement.definitionId),
      })
    }
  }
  return list
}

function eventState(scenarioId: string, types: string[]) {
  let state = createCellVisualState(scenarioId)
  for (const type of types) state = reduceCellVisualState(state, { type })
  return state
}

describe('S59 ScenarioCellAnimator node binding', () => {
  it('binds vision sorting part travel, inspection, classification and diverter to events', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('vision-sorting'))
    const idle = createCellVisualState('sorting-normal-cycle')
    animator.setState(idle)
    animator.tick(2)
    const idleSnapshot = animator.snapshot()
    expect(idleSnapshot.partPosition?.x).toBeCloseTo(-1.8, 5)

    animator.setState(eventState('sorting-normal-cycle', ['scenario.ready', 'sorting.complete']))
    animator.tick(2)
    const accepted = animator.snapshot()
    expect(accepted.classification).toBe('accepted')
    expect(accepted.inspectionActive).toBe(true)
    expect(accepted.partPosition?.x).toBeCloseTo(0.95, 5)
    expect(accepted.partPosition?.z).toBeCloseTo(-0.85, 5)
    expect(accepted.acceptedBinSignal).toBe('#2fa864')
    animator.dispose()
  })

  it('makes a jam visible, then routes the cleared part to the reject lane with the diverter extended', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('vision-sorting'))
    const jammed = createCellVisualState('sorting-jam-recovery')
    animator.setState(jammed)
    animator.tick(2)
    const jam = animator.snapshot()
    expect(jam.faultVisible).toBe(true)
    expect(jam.partPosition?.x).toBeCloseTo(-0.05, 5)
    expect(jam.diverterExtension).toBe(0)

    animator.setState(eventState('sorting-jam-recovery', ['scenario.ready', 'sorting.recovered']))
    animator.tick(2)
    const recovered = animator.snapshot()
    expect(recovered.classification).toBe('rejected')
    expect(recovered.partPosition?.z).toBeCloseTo(0.85, 5)
    expect(recovered.diverterExtension).toBe(1)
    expect(recovered.rejectBinSignal).toBe('#c0392b')
    animator.dispose()
  })

  it('binds palletizing box travel, layer placement and vacuum loss', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('robot-palletizing'))
    const vacuum = createCellVisualState('palletizing-vacuum-recovery')
    animator.setState(vacuum)
    animator.tick(2)
    expect(animator.snapshot().vacuumLoss).toBe(true)
    expect(animator.snapshot().activeBoxPosition?.x).toBeCloseTo(-2.6, 5)

    animator.setState(eventState('palletizing-normal-cycle', ['scenario.ready', 'palletizing.complete']))
    animator.tick(2)
    const placed = animator.snapshot()
    expect(placed.placedLayers).toBe(1)
    expect(placed.activeBoxPosition?.x).toBeCloseTo(0.8, 5)
    expect(placed.activeBoxPosition?.y).toBeCloseTo(0.66, 5)

    animator.setState(eventState('palletizing-vacuum-recovery', ['scenario.ready', 'palletizing.recovered']))
    animator.tick(2)
    expect(animator.snapshot().vacuumLoss).toBe(false)
    animator.dispose()
  })

  it('binds assembly clamp and part-presence state', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('assembly-inspection'))
    const state = { ...createCellVisualState('assembly-inspection-cycle'), clamped: true }
    animator.setState(state)
    animator.tick(2)
    const clamped = animator.snapshot()
    expect(clamped.clamped).toBe(true)
    expect(clamped.clampAngle).toBeCloseTo(-0.6, 5)
    expect(clamped.partPresent).toBe(true)

    animator.setState({ ...state, clamped: false })
    animator.tick(2)
    expect(animator.snapshot().clampAngle).toBeCloseTo(0, 5)
    animator.dispose()
  })

  it('makes safety gate, scanner and E-stop state changes visible', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('robot-safety-training'))
    const unsafe = createCellVisualState('safety-door-recovery')
    animator.setState(unsafe)
    animator.tick(2)
    const open = animator.snapshot()
    expect(open.faultVisible).toBe(true)
    expect(open.gateOpenAmount).toBeCloseTo(1, 5)
    expect(open.estopPressedAmount).toBeCloseTo(1, 5)
    expect(open.scannerMuted).toBe(true)

    animator.setState(eventState('safety-door-recovery', ['scenario.ready', 'safety.restarted']))
    animator.tick(2)
    const safe = animator.snapshot()
    expect(safe.gateOpenAmount).toBeCloseTo(0, 5)
    expect(safe.estopPressedAmount).toBeCloseTo(0, 5)
    expect(safe.scannerMuted).toBe(false)
    expect(safe.stackLight).toBe('green')
    animator.dispose()
  })

  it('is deterministic and idempotent across repeated identical states', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('vision-sorting'))
    const state = eventState('sorting-normal-cycle', ['scenario.ready', 'sorting.complete'])
    animator.setState(state)
    animator.tick(2)
    const first = animator.snapshot()
    expect(animator.settled).toBe(true)
    animator.setState({ ...state })
    expect(animator.snapshot()).toEqual(first)
    animator.dispose()
  })
})

describe('S75 state-driven equipment motion', () => {
  it('closes the gripper fingers from the authoritative holding state and opens them again', () => {
    const animator = new ScenarioCellAnimator([
      { equipmentId: 'gripper-1', definitionId: 'two-finger-gripper', object: createMaterialFlowVisual('two-finger-gripper') },
    ])
    const idle = createCellVisualState('palletizing-normal-cycle')
    animator.setState(idle)
    animator.tick(2)
    const open = animator.snapshot().gripperFingerGap
    expect(open).toBeGreaterThan(0.05)

    animator.setState({ ...idle, gripperHolding: true })
    animator.tick(2)
    const closed = animator.snapshot().gripperFingerGap
    expect(closed).toBeLessThan(open)
    expect(closed).toBeCloseTo(0.018, 5)

    animator.setState({ ...idle, gripperHolding: false })
    animator.tick(2)
    expect(animator.snapshot().gripperFingerGap).toBeCloseTo(open, 5)
    animator.dispose()
  })

  it('advances the belt only while the cell is running and stops when it stops', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('vision-sorting'))
    const idle = createCellVisualState('sorting-normal-cycle')
    animator.setState(idle)
    animator.tick(1)
    expect(animator.snapshot().beltRunning).toBe(false)
    expect(animator.snapshot().beltOffset).toBe(0)

    animator.setState({ ...idle, lifecycle: 'running' })
    animator.tick(1)
    const running = animator.snapshot()
    expect(running.beltRunning).toBe(true)
    expect(running.beltSpeed).toBeGreaterThan(0)
    expect(running.beltOffset).toBeGreaterThan(0)

    animator.setState({ ...idle, lifecycle: 'completed' })
    animator.tick(1)
    const stopped = animator.snapshot()
    expect(stopped.beltRunning).toBe(false)
    expect(stopped.beltOffset).toBeCloseTo(running.beltOffset, 6)
    animator.dispose()
  })

  it('preserves the PBR base color while changing the signal emissive', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('vision-sorting'))
    const idle = createCellVisualState('sorting-normal-cycle')
    animator.setState(idle)
    animator.tick(2)
    const bin = animator['byClass'].get('storage-bin')![0]!
    const opening = animator['node'](bin, 'opening') as THREE.Mesh
    const material = opening.material as THREE.MeshStandardMaterial
    const baseColor = material.color.getHex()

    animator.setState(eventState('sorting-normal-cycle', ['scenario.ready', 'sorting.complete']))
    animator.tick(2)
    expect(material.color.getHex()).toBe(baseColor)
    expect(material.emissive.getHex()).toBe(0x2fa864)
    animator.dispose()
  })

  it('drives the optional robot-base beacon from robot state and bounds the dress-pack flex', () => {
    const animator = new ScenarioCellAnimator(equipmentFor('robot-palletizing'))
    const idle = createCellVisualState('palletizing-normal-cycle')
    animator.setState(idle)
    animator.tick(2)
    expect(animator.snapshot().robotBeaconSignal).toBe('off')

    animator.setState({ ...idle, lifecycle: 'running' })
    animator.tick(2)
    expect(animator.snapshot().robotBeaconSignal).toBe('running')

    animator.setState({ ...idle, lifecycle: 'running', fault: true })
    animator.tick(2)
    expect(animator.snapshot().robotBeaconSignal).toBe('fault')

    animator.setRobotPose([100, 100, 100])
    expect(animator.snapshot().dressPackFlex).toBeCloseTo(0.35, 6)
    animator.setRobotPose([0, 0, 0])
    expect(animator.snapshot().dressPackFlex).toBe(0)
    animator.dispose()
  })
})

describe('S59 ScenarioRuntimeHost visual binding', () => {
  function testRuntime(): EquipmentAssetRuntime {
    return new EquipmentAssetRuntime(
      createIndustrialAssetRegistry(),
      new ThreeGlbAssetLoader({ loadAsync: vi.fn(async () => { throw new Error('offline test runtime') }) }),
    )
  }

  it('drives visible state from the authoritative run/recover program for every material-flow scenario', async () => {
    const catalog = createDefaultScenePresetCatalog()
    for (const preset of catalog.list().filter(candidate => candidate.runtimeProfile === 'material-flow')) {
      const scenarioId = preset.defaultScenarioId!
      const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
      host.bind(resolveScenarioSceneBinding(scenarioId, catalog))
      await host.loadVisuals()

      const initial = host.visualSnapshot()
      expect(initial, scenarioId).not.toBeNull()

      host.run()
      host.tick(2)
      const running = host.visualSnapshot()!
      expect(running.lifecycle, scenarioId).toBe('running')

      host.recover()
      host.tick(2)
      const completed = host.visualSnapshot()!
      expect(completed.lifecycle, scenarioId).toBe('completed')

      host.dispose()
      expect(host.visualSnapshot()).toBeNull()
    }
  })

  it('keeps scenario outcomes unchanged by the visual layer', async () => {
    const catalog = createDefaultScenePresetCatalog()
    const scenario = getScenario('palletizing-normal-cycle')
    const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
    host.bind(resolveScenarioSceneBinding('palletizing-normal-cycle', catalog))
    await host.loadVisuals()

    const expectedTotal = scenario.activities.length
    expect(host.progress().totalActivities).toBe(expectedTotal)
    host.run()
    host.recover()
    expect(host.progress().status).toBe('completed')
    expect(host.progress().progressPercent).toBe(100)
    host.dispose()
  })
})
