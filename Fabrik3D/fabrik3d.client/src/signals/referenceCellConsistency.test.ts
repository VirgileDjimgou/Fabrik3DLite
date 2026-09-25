import { describe, expect, it } from 'vitest'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import { buildCncMachineVisual } from '../equipment/visuals/cncMachineVisual'
import { REFERENCE_CELL_VISUAL_BINDINGS } from '../equipment/visuals/referenceCellVisualMap'
import { CncCycleMachine, type CncCyclePhase } from '../simulation/CncCycleMachine'
import { SafetyInterlockModel } from '../safety'
import { FaultLabController, LOCAL_SIMULATION_AUTHORITY } from '../faults/FaultLabController'
import { TimelineRecorder, type TimelineContext } from '../timeline'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type CncSignalView,
  type ReferenceCellViews,
} from './index'

const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')

interface Harness {
  machine: CncCycleMachine
  binding: ReferenceCellSignalBinding
  read(id: string): unknown
  safety: SafetyInterlockModel
  advance(ms?: number): void
}

function createHarness(overlays: boolean): Harness & { lab: FaultLabController | null } {
  const clock = { ms: FIXED_NOW }
  const machine = new CncCycleMachine()
  const safety = new SafetyInterlockModel()
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => clock.ms })
  const timeline = new TimelineRecorder(() => new Date(clock.ms).toISOString())
  const lab = overlays
    ? new FaultLabController(timeline, LOCAL_SIMULATION_AUTHORITY, () => new Date(clock.ms).toISOString(), () => clock.ms)
    : null

  const cncView: CncSignalView = {
    getState: () => machine.coarseState,
    getDoorState: () => (machine.doorClosed ? 'closed' : machine.doorOpen ? 'open' : 'moving'),
    commandDoor: (open) => machine.commandDoor(open),
    startCycle: () => machine.startMachining(),
    getPhase: () => machine.phase,
    getDoorLocked: () => machine.doorLocked,
    getSpindleSpeed: () => machine.spindleSpeed,
    isSpindleAtSpeed: () => machine.spindleAtSpeed,
    getFeedRate: () => machine.feedRate,
    isFeedActive: () => machine.feedActive,
    isCoolantOn: () => machine.coolantOn,
    getCycleStep: () => machine.cycleStep,
    getFixtureClamped: () => machine.fixtureClamped,
    getPartPresent: () => machine.partPresent,
  }

  const views: ReferenceCellViews = {
    robot: {
      isServoOn: () => true,
      getWorkflowRunState: () => 'idle',
      getWorkflowPhase: () => 'IDLE',
      start: () => true,
      stop: () => true,
      reset: () => true,
    },
    cnc: cncView,
    conveyor: {
      isRunning: () => true,
      getSpeedReference: () => 0.35,
      getActualSpeed: () => 0.35,
      getPhotoeyeIn: () => false,
      getPhotoeyeStation: () => true,
      getEncoderPulses: () => 0,
      setRunCommand: () => true,
      setSpeedReference: () => true,
      getRawSlotsRemaining: () => 7,
      getMachinedSlots: () => 2,
    },
    safety: {
      isEmergencyStop: () => safety.getState().emergencyStop,
      isGateClosed: () => safety.getState().gateClosed,
      isGateLocked: () => safety.getState().gateLocked,
      isLightCurtainClear: () => safety.getState().lightCurtainClear,
      isScannerClear: () => safety.getState().scannerClear,
      isHealthy: () => safety.isHealthy(),
      reset: () => safety.reset(),
    },
    faults: { isActiveFor: () => false },
  }

  const binding = new ReferenceCellSignalBinding({
    registry,
    equipment: REFERENCE_CELL_EQUIPMENT_IDS,
    views,
    now: () => clock.ms,
    overlays: lab
      ? {
        apply: (signalId, value, quality, safeValue, numeric) => {
          const result = lab.apply(signalId, value, quality, safeValue, numeric)
          return { value: result.value, quality: result.quality }
        },
        advanceTick: () => lab.advanceTick(),
        blocksCommand: (signalId) => lab.blocksCommand(signalId),
      }
      : null,
  })

  return {
    machine,
    binding,
    safety,
    lab,
    read: (id) => registry.read(id, clock.ms)?.value,
    advance: (ms = 20) => { clock.ms += ms },
  }
}

const context: TimelineContext = {
  source: 'simulator', sessionId: 'test-session', equipmentId: 'cnc-1', correlationId: 'test-correlation',
}

/** Steps a machine until it reaches `target`; a parameter defeats TS narrowing. */
function advanceUntil(machine: CncCycleMachine, target: CncCyclePhase, dt = 0.02): void {
  let guard = 0
  while (machine.phase !== target && guard < 10_000) { machine.update(dt); guard += 1 }
}

describe('reference-cell signal/visual consistency (S39)', () => {
  it('keeps every CNC signal consistent with the cycle machine through a full cycle', () => {
    const { machine, binding, read, advance } = createHarness(false)
    machine.loadPart()
    for (let step = 0; step < 2_000 && machine.phase !== 'UNLOAD_READY'; step += 1) {
      machine.update(0.02)
      if (machine.phase === 'LOAD_READY') machine.startMachining()
      advance()
      binding.tick()
      expect(read('cnc-1.DoorOpen')).toBe(machine.doorOpen)
      expect(read('cnc-1.DoorClosed')).toBe(machine.doorClosed)
      expect(read('cnc-1.DoorLocked')).toBe(machine.doorLocked)
      expect(read('cnc-1.FixtureClamped')).toBe(machine.fixtureClamped)
      expect(read('cnc-1.PartPresent')).toBe(machine.partPresent)
      expect(read('cnc-1.FeedActive')).toBe(machine.feedActive)
      expect(read('cnc-1.CoolantOn')).toBe(machine.coolantOn)
      expect(read('cnc-1.SpindleSpeed')).toBe(machine.spindleSpeed)
      expect(read('cnc-1.CycleStep')).toBe(machine.cycleStep)
      expect(read('cnc-1.CycleRunning')).toBe(machine.coarseState === 'MACHINING')
      expect(read('cnc-1.SpindleRunning')).toBe(machine.coarseState === 'MACHINING')
      // No contradictory animation: the spindle is never turning with the door open.
      if (machine.doorOpen) expect(machine.spindleSpeed).toBe(0)
    }
    expect(machine.phase).toBe('UNLOAD_READY')
    expect(read('cnc-1.CycleComplete')).toBe(true)
    expect(read('cnc-1.PartPresent')).toBe(true)
  })

  it('maps every state-bearing CNC visual node to a runtime state and a declared signal', () => {
    const visual = buildCncMachineVisual()
    const nodes: string[] = []
    visual.group.traverse((child) => {
      const id = child.userData?.semanticId
      if (typeof id === 'string' && id !== 'equipment:cnc') nodes.push(id)
    })
    const mapped = REFERENCE_CELL_VISUAL_BINDINGS.map((entry) => entry.node)
    for (const node of nodes) expect(mapped).toContain(node)

    const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => FIXED_NOW })
    for (const entry of REFERENCE_CELL_VISUAL_BINDINGS) {
      expect(entry.stateSource.length).toBeGreaterThan(0)
      expect(entry.signalId, `binding for ${entry.node}`).toBeTruthy()
      expect(registry.getDefinition(entry.signalId!)).toBeTruthy()
    }
    visual.dispose()
  })

  it('reports the conveyor material-flow counts and speed deviation from runtime', () => {
    const { binding, read, advance } = createHarness(false)
    advance()
    binding.tick()
    expect(read('conveyor-1.RawSlotsRemaining')).toBe(7)
    expect(read('conveyor-1.MachinedSlots')).toBe(2)
    expect(read('conveyor-1.SpeedDeviation')).toBe(0)
    expect(read('robot-1.Dwell')).toBe(false)
    expect(read('robot-1.CycleStep')).toBe(0)
    expect(read('safety-zone-1.SafetyResetRequired')).toBe(false)
  })

  it('recovers deterministically after a simulated CNC signal fault is cleared', () => {
    const { machine, binding, read, advance, lab } = createHarness(true)
    machine.loadPart()
    advanceUntil(machine, 'LOAD_READY')
    machine.startMachining()
    advanceUntil(machine, 'FEED')
    machine.update(0.02)
    advance()
    binding.tick()
    const cleanSpeed = read('cnc-1.SpindleSpeed')
    expect(cleanSpeed).toBe(8_000)

    const activation = lab!.activate(
      { type: 'noisy-analog', equipmentId: 'cnc-1', signalIds: ['cnc-1.SpindleSpeed'], seed: 7, magnitude: 0.1 },
      context,
    )
    expect(activation.accepted).toBe(true)
    expect(read('cnc-1.Fault')).toBe(false)

    advance()
    binding.tick()
    expect(read('cnc-1.SpindleSpeed')).not.toBe(cleanSpeed)

    lab!.deactivate(activation.overlay!.id, context)
    advance()
    binding.tick()
    // Removing the overlay restores the exact pre-fault value: no residue.
    expect(read('cnc-1.SpindleSpeed')).toBe(cleanSpeed)
  })

  it('refuses a command whose signal is owned by an active fault overlay', () => {
    const { machine, binding, advance, lab } = createHarness(true)
    machine.loadPart()
    while (machine.phase !== 'LOAD_READY') machine.update(0.02)
    advance()
    expect(binding.write('cnc-1.CycleStart', true)).toMatchObject({ accepted: true })

    const activation = lab!.activate(
      { type: 'forced-true', equipmentId: 'cnc-1', signalIds: ['cnc-1.CycleStart'] },
      context,
    )
    expect(activation.accepted).toBe(true)
    advance()
    expect(binding.write('cnc-1.CycleStart', true)).toMatchObject({ accepted: false, reason: 'runtime-rejected' })
  })
})

describe('safety interlock reset sequencing (S39)', () => {
  it('requires a plausible safe sequence before clearing the simulated E-stop', () => {
    const safety = new SafetyInterlockModel()
    safety.triggerEmergencyStop()
    safety.setLightCurtainClear(false)
    expect(safety.isHealthy()).toBe(false)
    expect(safety.reset()).toEqual({ accepted: false, reason: 'light-curtain-blocked' })

    safety.setLightCurtainClear(true)
    safety.setScannerClear(false)
    expect(safety.reset()).toEqual({ accepted: false, reason: 'scanner-blocked' })

    safety.setScannerClear(true)
    safety.openGate()
    expect(safety.reset()).toEqual({ accepted: false, reason: 'gate-open' })

    safety.closeGate()
    expect(safety.reset()).toEqual({ accepted: true })
    expect(safety.getState().emergencyStop).toBe(false)
    expect(safety.getState().gateLocked).toBe(true)
    expect(safety.isHealthy()).toBe(true)
  })
})
