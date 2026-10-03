import { describe, expect, it, vi } from 'vitest'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from './ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from './sceneBinding'

/**
 * S67 integration: the deterministic process scheduler drives the same
 * authoritative `ScenarioRunner` and `CellVisualState` the existing runtime
 * already uses. The tests prove intermediate stages are inspectable in Step
 * Mode, that a fault interrupts at its declared stage and resumes from a
 * defined recovery point, and that robot/equipment visuals reflect but never
 * author scenario state.
 */

function testRuntime(): EquipmentAssetRuntime {
  const loadAsync = vi.fn(async () => { throw new Error('offline test runtime') })
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
}

function bindingFor(scenarioId: string) {
  return resolveScenarioSceneBinding(scenarioId, createDefaultScenePresetCatalog())
}

async function boundHost(scenarioId: string): Promise<ScenarioRuntimeHost> {
  const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
  host.bind(bindingFor(scenarioId))
  await host.loadVisuals()
  return host
}

describe('S67 scenario process host integration', () => {
  it('exposes every intermediate vision-sorting stage deterministically in Step Mode', async () => {
    const host = await boundHost('sorting-normal-cycle')
    host.startProcess()

    const stages: (string | null)[] = []
    const inspections: boolean[] = []
    const classifications: (string | null)[] = []
    let guard = 0
    while (host.processState!.phase !== 'awaiting-acknowledgement' && guard < 32) {
      guard += 1
      const before = host.progress().completedCount
      host.stepProcess()
      expect(host.progress().completedCount).toBe(before + 1)
      stages.push(host.visualState.processStageId)
      inspections.push(host.visualState.inspectionActive)
      classifications.push(host.visualState.classification)
    }

    expect(stages).toEqual([
      'vision-part-enters',
      'vision-sensor-detects',
      'vision-conveyor-advances',
      'vision-inspection-begins',
      'vision-classified',
      'vision-diverter-actuates',
      'vision-part-routes',
      'vision-part-routes',
    ])
    expect(inspections[3]).toBe(true)
    expect(classifications[4]).toBe('accepted')
    expect(host.visualState.partStage).toBe('diverted')
    expect(host.progress().completedCount).toBe(bindingFor('sorting-normal-cycle').scenario!.activities.length - 1)

    // The explicit acknowledgement still completes the scenario.
    expect(host.recover().status).toBe('completed')
    host.dispose()
  })

  it('interrupts a jam at the detection stage and resumes at the defined recovery point', async () => {
    const host = await boundHost('sorting-jam-recovery')
    host.startProcess()

    let guard = 0
    while (host.processState!.phase !== 'awaiting-recovery' && guard < 16) {
      guard += 1
      host.stepProcess()
    }
    expect(host.processState!.phase).toBe('awaiting-recovery')
    expect(host.visualState.processStageId).toBe('vision-jam-detected')
    expect(host.visualState.jam).toBe(true)
    expect(host.visualState.fault).toBe(true)
    expect(host.visualState.stackLight).toBe('red')

    const completedAtFault = host.progress().completedCount
    host.stepProcess()
    expect(host.progress().completedCount).toBe(completedAtFault)

    host.acknowledgeProcessFault()
    expect(host.processState!.phase).toBe('running')
    expect(host.processState!.stageId).toBe('vision-operator-acknowledged')

    while (host.processState!.phase !== 'awaiting-acknowledgement' && guard < 64) {
      guard += 1
      host.stepProcess()
    }
    expect(host.visualState.jam).toBe(false)
    expect(host.visualState.classification).toBe('rejected')
    expect(host.visualState.recovered).toBe(true)
    expect(host.recover().status).toBe('completed')
    host.dispose()
  })

  it('keeps robot and equipment visuals derived from, never authoritative over, scenario state', async () => {
    const host = await boundHost('palletizing-normal-cycle')
    host.startProcess()

    // Step until the gripper is declared on; the visible equipment must follow.
    let guard = 0
    while (host.visualState.processStageId !== 'palletizing-gripper-on' && guard < 16) {
      guard += 1
      host.stepProcess()
    }
    expect(host.visualState.gripperHolding).toBe(true)
    expect(host.visualSnapshot()!.gripperHolding).toBe(true)

    // Reading visuals and advancing render/animation time never mutates the
    // authoritative process or scenario progress.
    const processBefore = host.processState!
    const progressBefore = host.progress()
    host.visualSnapshot()
    host.robotSnapshot()
    host.robotJointAngles()
    for (let index = 0; index < 20; index += 1) host.tick(0.1)
    expect(host.processState).toEqual(processBefore)
    expect(host.progress()).toEqual(progressBefore)

    // The controller owns the joints and mirrors them onto the visual; the
    // scenario only requested the motion, it never reads state back from it.
    const motion = host.robotSnapshot()!
    expect(motion.profileId).toBe('medium-6axis')
    expect(motion.jointAngles.every(Number.isFinite)).toBe(true)
    host.dispose()
  })

  it('replays the same paced process deterministically', async () => {
    async function capture(): Promise<string[]> {
      const host = await boundHost('assembly-inspection-cycle')
      host.startProcess()
      const trace: string[] = []
      let guard = 0
      while (host.processState!.phase !== 'awaiting-acknowledgement' && guard < 32) {
        guard += 1
        host.stepProcess()
        trace.push(`${host.progress().completedCount}:${host.visualState.processStageId}:${host.visualState.clamped}:${host.visualState.partPresent}`)
      }
      host.dispose()
      return trace
    }

    const first = await capture()
    const second = await capture()
    expect(second).toEqual(first)
    expect(first).toHaveLength(bindingFor('assembly-inspection-cycle').scenario!.activities.length - 1)
  })

  it('preserves the historical run/recover continuous behaviour', async () => {
    const host = await boundHost('safety-door-recovery')
    const running = host.run()
    expect(running.status).toBe('running')
    // Continuous run clears the simulated safety conditions (existing contract).
    expect(host.visualState.gateOpen).toBe(false)
    expect(host.visualState.emergencyStop).toBe(false)
    expect(host.processState!.phase).toBe('awaiting-acknowledgement')
    expect(host.recover().status).toBe('completed')
    host.dispose()
  })
})
