import { describe, expect, it } from 'vitest'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import { ReferenceCellSignalBinding, type ReferenceCellViews } from './binding'
import { REFERENCE_CELL_EQUIPMENT_IDS, createReferenceCellSignalRegistry } from './referenceCell'

const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')

interface FakeRuntime {
  servoOn: boolean
  runState: string
  phase: string
  acceptStart: boolean
  startCalls: number
  stopCalls: number
  resetCalls: number
  cncState: string
  doorState: 'open' | 'closed' | 'moving'
  acceptCycleStart: boolean
  doorCommands: boolean[]
  cycleStarts: number
  conveyorRunning: boolean
  actualSpeed: number
  photoeyeIn: boolean
  photoeyeStation: boolean
  encoderPulses: number
  runCommands: boolean[]
  speedWrites: number[]
  emergencyStop: boolean
  lightCurtainClear: boolean
  gateClosed: boolean
  gateLocked: boolean
  scannerClear: boolean
  acceptSafetyReset: boolean
  safetyResets: number
  activeFaults: Set<string>
}

function createRuntime(): FakeRuntime {
  return {
    servoOn: true,
    runState: 'idle',
    phase: 'IDLE',
    acceptStart: true,
    startCalls: 0,
    stopCalls: 0,
    resetCalls: 0,
    cncState: 'IDLE',
    doorState: 'closed',
    acceptCycleStart: true,
    doorCommands: [],
    cycleStarts: 0,
    conveyorRunning: true,
    actualSpeed: 0.35,
    photoeyeIn: false,
    photoeyeStation: false,
    encoderPulses: 0,
    runCommands: [],
    speedWrites: [],
    emergencyStop: false,
    lightCurtainClear: true,
    gateClosed: true,
    gateLocked: true,
    scannerClear: true,
    acceptSafetyReset: true,
    safetyResets: 0,
    activeFaults: new Set<string>(),
  }
}

function createViews(runtime: FakeRuntime): ReferenceCellViews {
  return {
    robot: {
      isServoOn: () => runtime.servoOn,
      getWorkflowRunState: () => runtime.runState,
      getWorkflowPhase: () => runtime.phase,
      start: () => { runtime.startCalls += 1; return runtime.acceptStart },
      stop: () => { runtime.stopCalls += 1; return true },
      reset: () => { runtime.resetCalls += 1; return true },
    },
    cnc: {
      getState: () => runtime.cncState,
      getDoorState: () => runtime.doorState,
      commandDoor: (open) => { runtime.doorCommands.push(open); return true },
      startCycle: () => { runtime.cycleStarts += 1; return runtime.acceptCycleStart },
    },
    conveyor: {
      isRunning: () => runtime.conveyorRunning,
      getSpeedReference: () => runtime.actualSpeed,
      getActualSpeed: () => runtime.actualSpeed,
      getPhotoeyeIn: () => runtime.photoeyeIn,
      getPhotoeyeStation: () => runtime.photoeyeStation,
      getEncoderPulses: () => runtime.encoderPulses,
      setRunCommand: (run) => { runtime.runCommands.push(run); return true },
      setSpeedReference: (speed) => { runtime.speedWrites.push(speed); return true },
    },
    safety: {
      isEmergencyStop: () => runtime.emergencyStop,
      isGateClosed: () => runtime.gateClosed,
      isGateLocked: () => runtime.gateLocked,
      isLightCurtainClear: () => runtime.lightCurtainClear,
      isScannerClear: () => runtime.scannerClear,
      isHealthy: () => !runtime.emergencyStop && runtime.gateClosed && runtime.gateLocked && runtime.lightCurtainClear && runtime.scannerClear,
      reset: () => { runtime.safetyResets += 1; return { accepted: runtime.acceptSafetyReset } },
    },
    faults: { isActiveFor: (equipmentId) => runtime.activeFaults.has(equipmentId) },
  }
}

function createHarness() {
  const runtime = createRuntime()
  const clock = { ms: FIXED_NOW }
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => clock.ms })
  const binding = new ReferenceCellSignalBinding({
    registry,
    equipment: REFERENCE_CELL_EQUIPMENT_IDS,
    views: createViews(runtime),
    now: () => clock.ms,
  })
  const advance = (ms = 1_000): void => { clock.ms += ms }
  return { runtime, registry, binding, clock, advance }
}

describe('ReferenceCellSignalBinding catalog', () => {
  it('binds every declared reference-cell signal with no coverage gap', () => {
    const { registry, binding } = createHarness()
    expect(registry.getAllDefinitions()).toHaveLength(43)
    expect(binding.catalogSize).toBe(43)
    expect(binding.coverageDiagnostics()).toEqual([])
    expect(binding.commandSignalIds).toEqual([
      'cnc-1.CycleStart', 'cnc-1.DoorCommand', 'conveyor-1.RunCommand', 'conveyor-1.SpeedReference',
      'robot-1.Reset', 'robot-1.Start', 'robot-1.Stop', 'safety-zone-1.SafetyReset',
    ])
  })

  it('reports declared signals without a reader or writer', () => {
    const { registry, binding } = createHarness()
    registry.register({
      id: 'robot-1.Placeholder', equipmentId: 'robot-1', name: 'Placeholder', displayName: 'Placeholder',
      direction: 'internal', dataType: 'bool', writable: false, defaultValue: false,
    })
    registry.register({
      id: 'unknown-9.Signal', equipmentId: 'unknown-9', name: 'Signal', displayName: 'Signal',
      direction: 'internal', dataType: 'bool', writable: false, defaultValue: false,
    })
    expect(binding.coverageDiagnostics()).toEqual([
      { signalId: 'robot-1.Placeholder', equipmentId: 'robot-1', reason: 'missing-writer' },
      { signalId: 'unknown-9.Signal', equipmentId: 'unknown-9', reason: 'unbound-equipment' },
    ])
  })
})

describe('ReferenceCellSignalBinding commands', () => {
  it('applies robot commands to the runtime and records them in the registry', () => {
    const { runtime, registry, binding, clock, advance } = createHarness()
    advance()
    expect(binding.write('robot-1.Start', true)).toMatchObject({ accepted: true })
    expect(runtime.startCalls).toBe(1)
    expect(registry.read('robot-1.Start', clock.ms)).toMatchObject({ value: true, source: 'commanded', origin: 'operator' })

    advance()
    expect(binding.write('robot-1.Stop', true).accepted).toBe(true)
    expect(binding.write('robot-1.Reset', true).accepted).toBe(true)
    expect(runtime.stopCalls).toBe(1)
    expect(runtime.resetCalls).toBe(1)
  })

  it('leaves the machine and stored value untouched when the runtime refuses', () => {
    const { runtime, registry, binding, clock, advance } = createHarness()
    runtime.acceptStart = false
    advance()
    const result = binding.write('robot-1.Start', true)
    expect(result).toMatchObject({ accepted: false, reason: 'runtime-rejected' })
    expect(runtime.startCalls).toBe(1)
    expect(registry.read('robot-1.Start', clock.ms)?.value).toBe(false)
  })

  it('rejects writes to read-only and unknown signals', () => {
    const { binding, advance } = createHarness()
    advance()
    expect(binding.write('robot-1.ServoOn', true)).toMatchObject({ accepted: false, reason: 'not-writable' })
    expect(binding.write('conveyor-1.Running', false)).toMatchObject({ accepted: false, reason: 'not-writable' })
    expect(binding.write('missing-1.Signal', true)).toMatchObject({ accepted: false, reason: 'unknown-signal' })
  })

  it('validates conveyor command values before touching the runtime', () => {
    const { runtime, binding, advance } = createHarness()
    advance()
    expect(binding.write('conveyor-1.RunCommand', false).accepted).toBe(true)
    expect(runtime.runCommands).toEqual([false])
    advance()
    expect(binding.write('conveyor-1.SpeedReference', 0.75).accepted).toBe(true)
    expect(runtime.speedWrites).toEqual([0.75])
    advance()
    expect(binding.write('conveyor-1.SpeedReference', 'fast')).toMatchObject({ accepted: false, reason: 'type-mismatch' })
    expect(runtime.speedWrites).toEqual([0.75])
  })

  it('binds CNC door and cycle commands to the machine', () => {
    const { runtime, binding, advance } = createHarness()
    advance()
    expect(binding.write('cnc-1.DoorCommand', true).accepted).toBe(true)
    expect(binding.write('cnc-1.CycleStart', true).accepted).toBe(true)
    expect(runtime.doorCommands).toEqual([true])
    expect(runtime.cycleStarts).toBe(1)

    runtime.acceptCycleStart = false
    advance()
    expect(binding.write('cnc-1.CycleStart', true)).toMatchObject({ accepted: false, reason: 'runtime-rejected' })
  })

  it('refuses a safety reset while the runtime reports unsafe conditions', () => {
    const { runtime, binding, advance } = createHarness()
    runtime.emergencyStop = true
    runtime.lightCurtainClear = false
    runtime.acceptSafetyReset = false
    advance()
    expect(binding.write('safety-zone-1.SafetyReset', true)).toMatchObject({ accepted: false, reason: 'runtime-rejected' })
    expect(runtime.safetyResets).toBe(1)

    runtime.lightCurtainClear = true
    runtime.acceptSafetyReset = true
    advance()
    expect(binding.write('safety-zone-1.SafetyReset', true).accepted).toBe(true)
  })
})

describe('ReferenceCellSignalBinding status derivation', () => {
  it('derives machine status signals from actual runtime state', () => {
    const { runtime, registry, binding, clock, advance } = createHarness()
    runtime.runState = 'running'
    runtime.phase = 'MOVE_TO_CNC_INSERT'
    runtime.cncState = 'MACHINING'
    runtime.doorState = 'closed'
    runtime.actualSpeed = 0.4
    runtime.photoeyeStation = true
    runtime.encoderPulses = 1_234
    advance()
    binding.tick()

    const value = (id: string) => registry.read(id, clock.ms)?.value
    expect(value('robot-1.ProgramRunning')).toBe(true)
    expect(value('robot-1.Ready')).toBe(false)
    expect(value('robot-1.AtMachine')).toBe(true)
    expect(value('robot-1.AtPick')).toBe(false)
    expect(value('robot-1.GripperClosed')).toBe(true)
    expect(value('robot-1.GripperOpen')).toBe(false)
    expect(value('robot-1.PayloadDetected')).toBe(true)
    expect(value('cnc-1.CycleRunning')).toBe(true)
    expect(value('cnc-1.CycleComplete')).toBe(false)
    expect(value('cnc-1.SpindleSpeed')).toBe(8_000)
    expect(value('cnc-1.FeedRate')).toBe(250)
    expect(value('cnc-1.DoorClosed')).toBe(true)
    expect(value('cnc-1.PartPresent')).toBe(true)
    expect(value('conveyor-1.Running')).toBe(true)
    expect(value('conveyor-1.ActualSpeed')).toBe(0.4)
    expect(value('conveyor-1.PhotoeyeStation')).toBe(true)
    expect(value('conveyor-1.EncoderPulse')).toBe(1_234)
    expect(value('safety-zone-1.SafetyHealthy')).toBe(true)
    expect(value('safety-zone-1.EmergencyStop')).toBe(false)
  })

  it('marks fault and protective-stop signals from active faults and safety state', () => {
    const { runtime, registry, binding, clock, advance } = createHarness()
    runtime.activeFaults.add('robot-1')
    runtime.activeFaults.add('cnc-1')
    runtime.activeFaults.add('conveyor-1')
    runtime.emergencyStop = true
    advance()
    binding.tick()

    const value = (id: string) => registry.read(id, clock.ms)?.value
    expect(value('robot-1.Fault')).toBe(true)
    expect(value('robot-1.ProtectiveStop')).toBe(true)
    expect(value('cnc-1.Fault')).toBe(true)
    expect(value('cnc-1.EmergencyStop')).toBe(true)
    expect(value('conveyor-1.MotorFault')).toBe(true)
    expect(value('safety-zone-1.SafetyHealthy')).toBe(false)
  })

  it('stops reporting the conveyor as running when the belt is stopped', () => {
    const { runtime, registry, binding, clock, advance } = createHarness()
    runtime.actualSpeed = 0
    advance()
    binding.tick()
    expect(registry.read('conveyor-1.Running', clock.ms)?.value).toBe(false)
    expect(registry.read('conveyor-1.ActualSpeed', clock.ms)?.value).toBe(0)
  })
})

describe('ReferenceCellSignalBinding lifecycle and performance', () => {
  it('stops ticking and rejects commands after disposal', () => {
    const { runtime, binding, advance } = createHarness()
    binding.dispose()
    advance()
    binding.tick()
    expect(runtime.startCalls).toBe(0)
    expect(binding.write('robot-1.Start', true)).toMatchObject({ accepted: false, reason: 'runtime-rejected' })
  })

  it('keeps one binding tick under the documented per-frame budget', () => {
    const { binding, advance } = createHarness()
    const ticks = 1_000
    const started = Date.now()
    for (let index = 0; index < ticks; index += 1) {
      advance(16)
      binding.tick()
    }
    const elapsedMs = Date.now() - started
    const averageMs = elapsedMs / ticks
    console.info(`[signal-binding-benchmark] ${ticks} ticks over 43 signals in ${elapsedMs} ms (avg ${averageMs.toFixed(4)} ms)`)
    expect(averageMs).toBeLessThan(1)
  })
})
