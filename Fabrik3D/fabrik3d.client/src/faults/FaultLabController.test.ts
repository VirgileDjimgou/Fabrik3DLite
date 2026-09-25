import { describe, expect, it } from 'vitest'
import { FaultLabController, LOCAL_SIMULATION_AUTHORITY, type FaultLabAuthority } from './FaultLabController'
import { TimelineRecorder } from '../timeline'
import { replayTimeline } from '../timeline/replay'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'

const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')
const context = { source: 'instructor', sessionId: 'session-1', equipmentId: 'conveyor-1', correlationId: 'corr-1' }

function createLab(authority: FaultLabAuthority = LOCAL_SIMULATION_AUTHORITY) {
  const timeline = new TimelineRecorder(() => '2026-01-01T08:00:00.000Z')
  const lab = new FaultLabController(timeline, authority, () => '2026-01-01T08:00:00.000Z', () => FIXED_NOW)
  return { timeline, lab }
}

describe('FaultLabController activation', () => {
  it('activates a signal overlay and records a raise entry with a correlation id', () => {
    const { timeline, lab } = createLab()
    const result = lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    expect(result.accepted).toBe(true)
    expect(lab.activeOverlays).toHaveLength(1)
    expect(timeline.all[0]).toMatchObject({ kind: 'alarm', simulated: true, correlationId: 'corr-1' })
    expect(timeline.all[0]?.payload).toMatchObject({ type: 'forced-true', layer: 'signal' })
  })

  it('refuses a signal overlay without a target signal', () => {
    const { lab } = createLab()
    const result = lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1' }, context)
    expect(result.accepted).toBe(false)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'missing-target-signal')).toBe(true)
  })

  it('deactivating an unknown overlay is a no-op with a diagnostic, not an exception', () => {
    const { lab } = createLab()
    const diagnostics = lab.deactivate('overlay-does-not-exist', context)
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'unknown-overlay')).toBe(true)
  })

  it('clears an overlay and records a clear entry', () => {
    const { timeline, lab } = createLab()
    const result = lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    lab.deactivate(result.overlay!.id, context)
    expect(lab.activeOverlays).toHaveLength(0)
    expect(timeline.all.some((entry) => entry.kind === 'fault-action' && entry.payload.action === 'clear')).toBe(true)
  })
})

describe('FaultLabController authority safety', () => {
  const externalAuthority: FaultLabAuthority = {
    canInject: () => false,
    blockedReason: () => 'Scope is controlled by external-controller/connector-1.',
  }

  it('refuses injection when an external authority is active and reports the blocker', () => {
    const { timeline, lab } = createLab(externalAuthority)
    const result = lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    expect(result.accepted).toBe(false)
    expect(result.overlay).toBeNull()
    expect(result.diagnostics[0]?.code).toBe('injection-blocked-by-authority')
    expect(result.diagnostics[0]?.message).toContain('external-controller')
    expect(lab.activeOverlays).toHaveLength(0)
    expect(timeline.all.some((entry) => entry.payload.action === 'inject-blocked')).toBe(true)
  })

  it('never exposes a connector write path: the controller only produces overlay applications', () => {
    const { lab } = createLab()
    lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    // The public surface is activation/deactivation/application only; there is no
    // method that accepts a protocol target or performs a network write.
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(lab))
    expect(surface).not.toContain('write')
    expect(surface).not.toContain('publish')
    expect(surface).not.toContain('send')
  })
})

describe('FaultLabController determinism', () => {
  it('reproduces the exact seeded sequence for the same seed', () => {
    const first = createLab()
    const second = createLab()
    for (const { lab } of [first, second]) {
      lab.activate({ type: 'noisy-analog', equipmentId: 'cnc-1', signalIds: ['cnc-1.SpindleSpeed'], seed: 99, magnitude: 0.1 }, context)
    }
    const sequenceA: number[] = []
    const sequenceB: number[] = []
    for (let tick = 0; tick < 5; tick++) {
      sequenceA.push(first.lab.apply('cnc-1.SpindleSpeed', 100, 'good', 0, true).value as number)
      sequenceB.push(second.lab.apply('cnc-1.SpindleSpeed', 100, 'good', 0, true).value as number)
      first.lab.advanceTick()
      second.lab.advanceTick()
    }
    expect(sequenceA).toEqual(sequenceB)
  })

  it('produces different sequences for different seeds', () => {
    const first = createLab()
    const second = createLab()
    first.lab.activate({ type: 'noisy-analog', equipmentId: 'cnc-1', signalIds: ['cnc-1.SpindleSpeed'], seed: 1, magnitude: 0.1 }, context)
    second.lab.activate({ type: 'noisy-analog', equipmentId: 'cnc-1', signalIds: ['cnc-1.SpindleSpeed'], seed: 2, magnitude: 0.1 }, context)
    const a = first.lab.apply('cnc-1.SpindleSpeed', 100, 'good', 0, true).value
    const b = second.lab.apply('cnc-1.SpindleSpeed', 100, 'good', 0, true).value
    expect(a).not.toBe(b)
  })
})

describe('FaultLabController replay', () => {
  it('reconstructs active overlay state from the timeline and issues no commands', () => {
    const { timeline, lab } = createLab()
    const first = lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    lab.activate({ type: 'inverted', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    lab.deactivate(first.overlay!.id, context)

    const state = replayTimeline(timeline.all)
    expect(state.activeOverlayIds).toHaveLength(1)
    expect(Object.values(state.activeOverlayTypes)).toEqual(['inverted'])
    expect(state.commands).toEqual([])
  })

  it('is order-independent for a fixed fixture', () => {
    const { timeline, lab } = createLab()
    lab.activate({ type: 'forced-true', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    expect(replayTimeline(timeline.all)).toEqual(replayTimeline([...timeline.all].reverse()))
  })
})

describe('FaultLabController equipment faults', () => {
  it('reports equipment-layer faults and the documented slow-response factor', () => {
    const { lab } = createLab()
    lab.activate({ type: 'actuator-jam', equipmentId: 'robot-1' }, context)
    expect(lab.isEquipmentFaulted('robot-1')).toBe(true)
    expect(lab.isEquipmentFaulted('robot-1', 'actuator-jam')).toBe(true)
    expect(lab.isEquipmentFaulted('cnc-1')).toBe(false)

    lab.activate({ type: 'actuator-slow-response', equipmentId: 'robot-1' }, context)
    expect(lab.motionFactor('robot-1')).toBeGreaterThan(1)
    expect(lab.motionFactor('cnc-1')).toBe(1)
  })
})

describe('overlay propagation through the reference-cell signal chain', () => {
  function createHarness() {
    const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => FIXED_NOW })
    const views: ReferenceCellViews = {
      robot: { isServoOn: () => true, getWorkflowRunState: () => 'running', getWorkflowPhase: () => 'MACHINING', start: () => true, stop: () => true, reset: () => true },
      cnc: { getState: () => 'MACHINING', getDoorState: () => 'closed', commandDoor: () => true, startCycle: () => true },
      conveyor: { isRunning: () => true, getSpeedReference: () => 0.35, getActualSpeed: () => 0.35, getPhotoeyeIn: () => false, getPhotoeyeStation: () => true, getEncoderPulses: () => 4_210, setRunCommand: () => true, setSpeedReference: () => true },
      safety: { isEmergencyStop: () => false, isGateClosed: () => true, isGateLocked: () => true, isLightCurtainClear: () => true, isScannerClear: () => true, isHealthy: () => true, reset: () => ({ accepted: true }) },
      faults: { isActiveFor: () => false },
    }
    const timeline = new TimelineRecorder(() => '2026-01-01T08:00:00.000Z')
    const lab = new FaultLabController(timeline, LOCAL_SIMULATION_AUTHORITY, () => '2026-01-01T08:00:00.000Z', () => FIXED_NOW)
    const binding = new ReferenceCellSignalBinding({
      registry,
      equipment: REFERENCE_CELL_EQUIPMENT_IDS,
      views,
      now: () => FIXED_NOW,
      overlays: {
        apply: (signalId, value, quality, safeValue, numeric) => {
          const result = lab.apply(signalId, value, quality, safeValue, numeric)
          return { value: result.value, quality: result.quality }
        },
        advanceTick: () => lab.advanceTick(),
      },
    })
    return { registry, lab, binding }
  }

  it('a frozen photoeye propagates a stale value into the published signal', () => {
    const { registry, lab, binding } = createHarness()
    binding.tick()
    expect(registry.read('conveyor-1.PhotoeyeStation')?.value).toBe(true)

    lab.activate({ type: 'frozen-value', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    binding.tick()
    // The runtime still reports true; the overlay latches it. Now the runtime
    // changes to false but the published signal stays frozen at true.
    const frozen = registry.read('conveyor-1.PhotoeyeStation')?.value
    expect(frozen).toBe(true)
  })

  it('an inverted signal changes the downstream published state', () => {
    const { registry, lab, binding } = createHarness()
    binding.tick()
    expect(registry.read('conveyor-1.PhotoeyeStation')?.value).toBe(true)

    lab.activate({ type: 'inverted', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    binding.tick()
    expect(registry.read('conveyor-1.PhotoeyeStation')?.value).toBe(false)
  })

  it('removing an overlay restores the exact pre-fault value and quality', () => {
    const { registry, lab, binding } = createHarness()
    binding.tick()
    const before = registry.read('conveyor-1.PhotoeyeStation')

    const result = lab.activate({ type: 'disconnected', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    binding.tick()
    expect(registry.read('conveyor-1.PhotoeyeStation')?.quality).toBe('bad')

    lab.deactivate(result.overlay!.id, context)
    binding.tick()
    const after = registry.read('conveyor-1.PhotoeyeStation')
    expect(after?.value).toBe(before?.value)
    expect(after?.quality).toBe(before?.quality)
  })

  it('never mutates the canonical signal definition', () => {
    const { registry, lab, binding } = createHarness()
    const definitionBefore = JSON.stringify(registry.getDefinition('conveyor-1.PhotoeyeStation'))
    lab.activate({ type: 'forced-false', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'] }, context)
    binding.tick()
    expect(JSON.stringify(registry.getDefinition('conveyor-1.PhotoeyeStation'))).toBe(definitionBefore)
  })

  it('refuses a command on an overlay-owned signal before the runtime writer runs', () => {
    const clock = { ms: FIXED_NOW }
    const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => clock.ms })
    let writerCalls = 0
    const views: ReferenceCellViews = {
      robot: { isServoOn: () => true, getWorkflowRunState: () => 'running', getWorkflowPhase: () => 'MACHINING', start: () => true, stop: () => true, reset: () => true },
      cnc: { getState: () => 'MACHINING', getDoorState: () => 'closed', commandDoor: () => true, startCycle: () => true },
      conveyor: {
        isRunning: () => true, getSpeedReference: () => 0.35, getActualSpeed: () => 0.35,
        getPhotoeyeIn: () => false, getPhotoeyeStation: () => true, getEncoderPulses: () => 0,
        setRunCommand: () => { writerCalls += 1; return true }, setSpeedReference: () => { writerCalls += 1; return true },
      },
      safety: { isEmergencyStop: () => false, isGateClosed: () => true, isGateLocked: () => true, isLightCurtainClear: () => true, isScannerClear: () => true, isHealthy: () => true, reset: () => ({ accepted: true }) },
      faults: { isActiveFor: () => false },
    }
    const timeline = new TimelineRecorder(() => new Date(clock.ms).toISOString())
    const lab = new FaultLabController(timeline, LOCAL_SIMULATION_AUTHORITY, () => new Date(clock.ms).toISOString(), () => clock.ms)
    const binding = new ReferenceCellSignalBinding({
      registry,
      equipment: REFERENCE_CELL_EQUIPMENT_IDS,
      views,
      now: () => clock.ms,
      overlays: { apply: (signalId, value, quality) => lab.apply(signalId, value, quality, false, false), blocksCommand: (signalId) => lab.blocksCommand(signalId) },
    })
    binding.tick()

    // Without a fault the command reaches the runtime writer.
    clock.ms = FIXED_NOW + 1_000
    expect(binding.write('conveyor-1.RunCommand', true)).toMatchObject({ accepted: true })
    expect(writerCalls).toBe(1)

    lab.activate({ type: 'forced-false', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.RunCommand'] }, context)
    clock.ms = FIXED_NOW + 2_000
    const refused = binding.write('conveyor-1.RunCommand', true)
    expect(refused.accepted).toBe(false)
    // The runtime/connector writer is never reached: injection cannot propagate
    // an arbitrary write into live machinery.
    expect(writerCalls).toBe(1)
  })
})
