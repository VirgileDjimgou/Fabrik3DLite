import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import type { EquipmentRuntimeState, RobotMotionRuntime } from '../equipment/types'
import { createFullPallet } from '../simulation/PalletModels'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from '../simulation/PalletMachiningWorkflow'
import { ReferenceCellSignalBinding } from './binding'
import { REFERENCE_CELL_EQUIPMENT_IDS, createReferenceCellSignalRegistry } from './referenceCell'
import type { SignalRegistry } from './SignalRegistry'

beforeEach(() => {
  // Fake timers drive both Date.now() and performance.now() deterministically.
  vi.useFakeTimers({
    toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

class FakeRobot implements RobotMotionRuntime {
  readonly equipmentId = 'robot-1'
  isMoving = false
  private joints = [0, 0, 0, 0, 0, 0]
  private current: { target: number[]; duration: number; elapsed: number } | null = null
  private queue: Array<{ target: number[]; duration: number }> = []

  moveJoints(target: number[], duration = 0): void {
    this.queue = []
    this.start(target, duration)
  }

  enqueueMove(target: number[], duration = 0): void {
    this.queue.push({ target: [...target], duration })
  }

  clearCommands(): void {
    this.queue = []
    this.current = null
    this.isMoving = false
  }

  getJointAngles(): number[] { return [...this.joints] }

  getRuntimeState(): EquipmentRuntimeState {
    return { status: this.isMoving ? 'running' : 'idle', updatedAt: '', values: {} }
  }

  tick(dt: number): void {
    if (!this.current) {
      this.startNext()
      return
    }
    this.current.elapsed += dt
    if (this.current.elapsed >= this.current.duration) {
      this.joints = [...this.current.target]
      this.current = null
      this.isMoving = false
      this.startNext()
    }
  }

  private startNext(): void {
    const next = this.queue.shift()
    if (next) this.start(next.target, next.duration)
  }

  private start(target: number[], duration: number): void {
    if (duration <= 0) {
      this.joints = [...target]
      this.current = null
      this.isMoving = false
      return
    }
    this.current = { target: [...target], duration, elapsed: 0 }
    this.isMoving = true
  }
}

class FakeCnc {
  state = 'IDLE'
  loadCount = 0
  startCount = 0
  unloadCount = 0
  private machiningRemaining = 0

  loadPart(): void {
    if (this.state !== 'IDLE') return
    this.state = 'LOADING'
    this.loadCount += 1
  }

  startMachining(): void {
    if (this.state !== 'LOADING') return
    this.state = 'MACHINING'
    this.startCount += 1
    this.machiningRemaining = 5
  }

  unloadComplete(): void {
    if (this.state !== 'UNLOADING') return
    this.state = 'IDLE'
    this.unloadCount += 1
  }

  getMachineState(): string { return this.state }

  tick(dt: number): void {
    if (this.state !== 'MACHINING') return
    this.machiningRemaining -= dt
    if (this.machiningRemaining <= 0) this.state = 'UNLOADING'
  }
}

interface RunResult {
  phases: string[]
  runStates: string[]
  slotsCompleted: number
  finalRunState: string
  cnc: FakeCnc
}

function driveWorkflow(cnc: FakeCnc, callbacks: PalletWorkflowCallbacks): RunResult {
  const robot = new FakeRobot()
  const workflow = new PalletMachiningWorkflow(robot, callbacks)
  const phases: string[] = []
  const runStates: string[] = []
  workflow.onPhaseChanged = (phase) => phases.push(phase)
  workflow.onRunStateChanged = (state) => runStates.push(state)

  workflow.start(createFullPallet('hex-billet', 2, 1, -1.5))
  let steps = 0
  while (workflow.runState !== 'complete' && steps < 20_000) {
    steps += 1
    vi.advanceTimersByTime(100)
    robot.tick(0.1)
    cnc.tick(0.1)
    workflow.update()
  }
  return { phases, runStates, slotsCompleted: workflow.slotsCompleted, finalRunState: workflow.runState, cnc }
}

function directCallbacks(cnc: FakeCnc): PalletWorkflowCallbacks {
  return {
    openCNCDoor: () => cnc.loadPart(),
    startCNCMachining: () => cnc.startMachining(),
    cncUnloadComplete: () => cnc.unloadComplete(),
    getCNCState: () => cnc.getMachineState(),
    hideSlotPart: () => {},
    showSlotPart: () => {},
  }
}

function createSignalCallbacks(): {
  callbacks: PalletWorkflowCallbacks
  binding: ReferenceCellSignalBinding
  registry: SignalRegistry
  cnc: FakeCnc
} {
  const cnc = new FakeCnc()
  const clock = () => Date.now()
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: clock })
  const binding = new ReferenceCellSignalBinding({
    registry,
    equipment: REFERENCE_CELL_EQUIPMENT_IDS,
    views: {
      robot: {
        isServoOn: () => true,
        getWorkflowRunState: () => 'idle',
        getWorkflowPhase: () => 'IDLE',
        start: () => true,
        stop: () => true,
        reset: () => true,
      },
      cnc: {
        getState: () => cnc.getMachineState(),
        getDoorState: () => cnc.getMachineState() === 'IDLE' || cnc.getMachineState() === 'LOADING' ? 'open' : 'closed',
        commandDoor: (open) => { if (open) cnc.loadPart(); return true },
        startCycle: () => { cnc.startMachining(); return true },
      },
      conveyor: {
        isRunning: () => true,
        getSpeedReference: () => 0.35,
        getActualSpeed: () => 0.35,
        getPhotoeyeIn: () => false,
        getPhotoeyeStation: () => false,
        getEncoderPulses: () => 0,
        setRunCommand: () => true,
        setSpeedReference: () => true,
      },
      safety: {
        isEmergencyStop: () => false,
        isGateClosed: () => true,
        isGateLocked: () => true,
        isLightCurtainClear: () => true,
        isScannerClear: () => true,
        isHealthy: () => true,
        reset: () => ({ accepted: true }),
      },
      faults: { isActiveFor: () => false },
    },
    now: clock,
  })
  const callbacks: PalletWorkflowCallbacks = {
    openCNCDoor: () => { binding.write('cnc-1.DoorCommand', true, 'simulation') },
    startCNCMachining: () => { binding.write('cnc-1.CycleStart', true, 'simulation') },
    cncUnloadComplete: () => cnc.unloadComplete(),
    getCNCState: () => cnc.getMachineState(),
    hideSlotPart: () => {},
    showSlotPart: () => {},
  }
  return { callbacks, binding, registry, cnc }
}

describe('workflow equivalence: UI/direct commands vs signal commands', () => {
  it('produces identical phases, run states and outcomes', () => {
    const directCnc = new FakeCnc()
    const direct = driveWorkflow(directCnc, directCallbacks(directCnc))

    const { callbacks, binding, cnc: signalCnc } = createSignalCallbacks()
    const viaSignals = driveWorkflow(signalCnc, callbacks)

    expect(viaSignals.phases).toEqual(direct.phases)
    expect(viaSignals.runStates).toEqual(direct.runStates)
    expect(viaSignals.slotsCompleted).toBe(2)
    expect(direct.slotsCompleted).toBe(2)
    expect(viaSignals.finalRunState).toBe('complete')
    expect(direct.finalRunState).toBe('complete')
    expect(signalCnc.loadCount).toBe(directCnc.loadCount)
    expect(signalCnc.startCount).toBe(directCnc.startCount)
    expect(signalCnc.unloadCount).toBe(directCnc.unloadCount)
    expect(binding.commandSignalIds).toContain('cnc-1.DoorCommand')
  })

  it('records the workflow commands as signal values with full coverage', () => {
    const { callbacks, binding, registry, cnc } = createSignalCallbacks()
    driveWorkflow(cnc, callbacks)
    expect(registry.read('cnc-1.DoorCommand')?.value).toBe(true)
    expect(registry.read('cnc-1.CycleStart')?.value).toBe(true)
    expect(binding.coverageDiagnostics()).toEqual([])
  })
})
