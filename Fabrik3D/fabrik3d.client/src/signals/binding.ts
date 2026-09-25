import type { SignalRegistry } from './SignalRegistry'
import {
  validateSignalValue,
  type SignalDiagnostic,
  type SignalUpdateOrigin,
  type SignalUpdateResult,
  type SignalValue,
} from './types'

/**
 * Framework-independent binding between the reference-cell runtime and the
 * industrial signal registry.
 *
 * - `tick` derives read-only status signals from the actual runtime on every frame.
 * - `write` validates a command signal, applies it to the runtime, then records it.
 * - Signals without a reader or writer are reported as engineering diagnostics,
 *   never silently fabricated.
 */

export interface RobotSignalView {
  isServoOn(): boolean
  getWorkflowRunState(): string
  getWorkflowPhase(): string
  /** Starts the pallet cycle. Returns false when the start preconditions are unmet. */
  start(): boolean
  stop(): boolean
  reset(): boolean
}

export interface CncSignalView {
  getState(): string
  getDoorState(): 'open' | 'closed' | 'moving'
  commandDoor(open: boolean): boolean
  /** Starts the machining cycle when the machine allows it. */
  startCycle(): boolean
}

export interface ConveyorSignalView {
  isRunning(): boolean
  getSpeedReference(): number
  getActualSpeed(): number
  getPhotoeyeIn(): boolean
  getPhotoeyeStation(): boolean
  getEncoderPulses(): number
  setRunCommand(run: boolean): boolean
  setSpeedReference(metersPerSecond: number): boolean
}

export interface SafetySignalView {
  isEmergencyStop(): boolean
  isGateClosed(): boolean
  isGateLocked(): boolean
  isLightCurtainClear(): boolean
  isScannerClear(): boolean
  isHealthy(): boolean
  reset(): { accepted: boolean; reason?: string }
}

export interface FaultSignalView {
  isActiveFor(equipmentId: string): boolean
}

export interface ReferenceCellViews {
  robot: RobotSignalView
  cnc: CncSignalView
  conveyor: ConveyorSignalView
  safety: SafetySignalView
  faults: FaultSignalView
}

export interface ReferenceCellEquipmentIds {
  robotId: string
  cncId: string
  conveyorId: string
  safetyId: string
}

export interface ReferenceCellSignalBindingOptions {
  registry: SignalRegistry
  equipment: ReferenceCellEquipmentIds
  views: ReferenceCellViews
  /** Injectable clock in milliseconds. */
  now?: () => number
}

export type SignalCoverageReason = 'missing-writer' | 'unbound-equipment'

export interface SignalCoverageDiagnostic {
  signalId: string
  equipmentId: string
  reason: SignalCoverageReason
}

/** Nominal simulated machining values, consistent with the CNC state machine. */
export const SIMULATED_SPINDLE_SPEED_RPM = 8_000
export const SIMULATED_FEED_RATE_MM_PER_MIN = 250

const PAYLOAD_PHASES = new Set([
  'PICK_PART', 'LIFT_FROM_PALLET', 'MOVE_TO_CNC_APPROACH', 'OPEN_CNC_DOOR', 'MOVE_TO_CNC_INSERT',
  'LOAD_PART', 'RETRACT_FROM_CNC', 'CLOSE_CNC_DOOR', 'MACHINING', 'OPEN_CNC_DOOR_RETRIEVE',
  'MOVE_TO_CNC_RETRIEVE', 'RETRIEVE_PART', 'LIFT_FROM_CNC', 'MOVE_ABOVE_ORIGIN_SLOT',
  'DESCEND_TO_ORIGIN_SLOT', 'PLACE_PART_BACK',
])
const PICK_POSITION_PHASES = new Set(['DESCEND_TO_PICK', 'PICK_PART'])
const MACHINE_POSITION_PHASES = new Set(['MOVE_TO_CNC_INSERT', 'LOAD_PART', 'MOVE_TO_CNC_RETRIEVE', 'RETRIEVE_PART'])
const HOME_PHASES = new Set(['IDLE', 'COMPLETE'])

type SignalReader = () => SignalValue
type CommandWriter = (value: SignalValue) => boolean

interface SignalChannel {
  equipmentId: string
  readers: Map<string, SignalReader>
  writers: Map<string, CommandWriter>
}

export class ReferenceCellSignalBinding {
  private readonly registry: SignalRegistry
  private readonly views: ReferenceCellViews
  private readonly now: () => number
  private readonly channels: SignalChannel[]
  private readonly writersBySignalId = new Map<string, CommandWriter>()
  private disposed = false

  constructor(options: ReferenceCellSignalBindingOptions) {
    this.registry = options.registry
    this.views = options.views
    this.now = options.now ?? (() => Date.now())
    this.channels = [
      this.buildRobotChannel(options.equipment.robotId),
      this.buildCncChannel(options.equipment.cncId),
      this.buildConveyorChannel(options.equipment.conveyorId),
      this.buildSafetyChannel(options.equipment.safetyId),
    ]
    for (const channel of this.channels) {
      for (const name of channel.writers.keys()) {
        this.writersBySignalId.set(`${channel.equipmentId}.${name}`, channel.writers.get(name)!)
      }
    }
  }

  get catalogSize(): number {
    return this.channels.reduce((total, channel) => total + channel.readers.size + channel.writers.size, 0)
  }

  get commandSignalIds(): readonly string[] {
    return [...this.writersBySignalId.keys()].sort()
  }

  /** Publishes every derived status signal. Rejected updates are ignored but never fabricated. */
  tick(at: number = this.now()): void {
    if (this.disposed) return
    const timestamp = new Date(at).toISOString()
    for (const channel of this.channels) {
      for (const [name, read] of channel.readers) {
        const signalId = `${channel.equipmentId}.${name}`
        const definition = this.registry.getDefinition(signalId)
        if (!definition) continue
        const value = read()
        if (validateSignalValue(definition, value)) continue
        this.registry.update({ signalId, value, source: 'simulated', origin: 'simulation', timestamp })
      }
    }
  }

  /**
   * Validates and applies a command signal. The runtime is only changed when the
   * command is legal for the current machine state; otherwise the previous value
   * and machine state remain untouched.
   */
  write(signalId: string, value: SignalValue, origin: SignalUpdateOrigin = 'operator', at: number = this.now()): SignalUpdateResult {
    if (this.disposed) {
      return { accepted: false, reason: 'runtime-rejected', message: 'Signal binding is disposed.' }
    }
    const definition = this.registry.getDefinition(signalId)
    if (!definition) {
      return { accepted: false, reason: 'unknown-signal', message: `Signal '${signalId}' is not registered.` }
    }
    const writer = this.writersBySignalId.get(signalId)
    if (!writer) {
      return { accepted: false, reason: 'not-writable', message: `Signal '${signalId}' has no command binding.` }
    }
    const valueDiagnostic = validateSignalValue(definition, value)
    if (valueDiagnostic) {
      return { accepted: false, reason: rejectionFor(valueDiagnostic), message: valueDiagnostic.message }
    }
    if (!writer(value)) {
      return { accepted: false, reason: 'runtime-rejected', message: `Simulated runtime refused the command for '${signalId}'.` }
    }
    return this.registry.update({ signalId, value, source: 'commanded', origin, timestamp: new Date(at).toISOString() })
  }

  /** Declared signals that have no reader or writer binding. */
  coverageDiagnostics(): readonly SignalCoverageDiagnostic[] {
    const diagnostics: SignalCoverageDiagnostic[] = []
    for (const definition of this.registry.getAllDefinitions()) {
      const channel = this.channels.find((candidate) => candidate.equipmentId === definition.equipmentId)
      if (!channel) {
        diagnostics.push({ signalId: definition.id, equipmentId: definition.equipmentId, reason: 'unbound-equipment' })
        continue
      }
      if (!channel.readers.has(definition.name) && !channel.writers.has(definition.name)) {
        diagnostics.push({ signalId: definition.id, equipmentId: definition.equipmentId, reason: 'missing-writer' })
      }
    }
    return diagnostics
  }

  dispose(): void {
    this.disposed = true
    this.channels.length = 0
    this.writersBySignalId.clear()
  }

  private buildRobotChannel(equipmentId: string): SignalChannel {
    const safetyStop = () => this.views.safety.isEmergencyStop() || !this.views.safety.isLightCurtainClear() || !this.views.safety.isScannerClear()
    const faulted = () => this.views.faults.isActiveFor(equipmentId)
    const carrying = () => PAYLOAD_PHASES.has(this.views.robot.getWorkflowPhase())
    return {
      equipmentId,
      readers: new Map<string, SignalReader>([
        ['ServoOn', () => this.views.robot.isServoOn()],
        ['Ready', () => this.views.robot.isServoOn() && !faulted() && !safetyStop() && this.views.robot.getWorkflowRunState() !== 'running'],
        ['ProgramRunning', () => this.views.robot.getWorkflowRunState() === 'running'],
        ['AtHome', () => HOME_PHASES.has(this.views.robot.getWorkflowPhase())],
        ['AtPick', () => PICK_POSITION_PHASES.has(this.views.robot.getWorkflowPhase())],
        ['AtMachine', () => MACHINE_POSITION_PHASES.has(this.views.robot.getWorkflowPhase())],
        ['GripperOpen', () => !carrying()],
        ['GripperClosed', () => carrying()],
        ['PayloadDetected', () => carrying()],
        ['Fault', faulted],
        ['ProtectiveStop', safetyStop],
      ]),
      writers: new Map<string, CommandWriter>([
        ['Start', (value) => value === true ? this.views.robot.start() : true],
        ['Stop', (value) => value === true ? this.views.robot.stop() : true],
        ['Reset', (value) => value === true ? this.views.robot.reset() : true],
      ]),
    }
  }

  private buildCncChannel(equipmentId: string): SignalChannel {
    const faulted = () => this.views.faults.isActiveFor(equipmentId)
    const machineState = () => this.views.cnc.getState()
    const doorState = () => this.views.cnc.getDoorState()
    return {
      equipmentId,
      readers: new Map<string, SignalReader>([
        ['Ready', () => machineState() === 'IDLE' && doorState() === 'closed' && !faulted() && !this.views.safety.isEmergencyStop()],
        ['DoorOpen', () => doorState() === 'open'],
        ['DoorClosed', () => doorState() === 'closed'],
        ['FixtureClamped', () => machineState() === 'MACHINING' || machineState() === 'UNLOADING'],
        ['PartPresent', () => machineState() !== 'IDLE'],
        ['CycleRunning', () => machineState() === 'MACHINING'],
        ['CycleComplete', () => machineState() === 'UNLOADING'],
        ['SpindleRunning', () => machineState() === 'MACHINING'],
        ['SpindleSpeed', () => machineState() === 'MACHINING' ? SIMULATED_SPINDLE_SPEED_RPM : 0],
        ['FeedRate', () => machineState() === 'MACHINING' ? SIMULATED_FEED_RATE_MM_PER_MIN : 0],
        ['Fault', faulted],
        ['EmergencyStop', () => this.views.safety.isEmergencyStop()],
      ]),
      writers: new Map<string, CommandWriter>([
        ['DoorCommand', (value) => this.views.cnc.commandDoor(value === true)],
        ['CycleStart', (value) => value === true ? this.views.cnc.startCycle() : true],
      ]),
    }
  }

  private buildConveyorChannel(equipmentId: string): SignalChannel {
    const faulted = () => this.views.faults.isActiveFor(equipmentId)
    return {
      equipmentId,
      readers: new Map<string, SignalReader>([
        ['Running', () => this.views.conveyor.isRunning() && this.views.conveyor.getActualSpeed() > 0],
        ['ActualSpeed', () => this.views.conveyor.getActualSpeed()],
        ['MotorFault', faulted],
        ['PhotoeyeIn', () => this.views.conveyor.getPhotoeyeIn()],
        ['PhotoeyeStation', () => this.views.conveyor.getPhotoeyeStation()],
        ['EncoderPulse', () => this.views.conveyor.getEncoderPulses()],
      ]),
      writers: new Map<string, CommandWriter>([
        ['RunCommand', (value) => this.views.conveyor.setRunCommand(value === true)],
        ['SpeedReference', (value) => typeof value === 'number' ? this.views.conveyor.setSpeedReference(value) : false],
      ]),
    }
  }

  private buildSafetyChannel(equipmentId: string): SignalChannel {
    return {
      equipmentId,
      readers: new Map<string, SignalReader>([
        ['EmergencyStop', () => this.views.safety.isEmergencyStop()],
        ['GateClosed', () => this.views.safety.isGateClosed()],
        ['GateLocked', () => this.views.safety.isGateLocked()],
        ['LightCurtainClear', () => this.views.safety.isLightCurtainClear()],
        ['ScannerClear', () => this.views.safety.isScannerClear()],
        ['SafetyHealthy', () => this.views.safety.isHealthy()],
      ]),
      writers: new Map<string, CommandWriter>([
        ['SafetyReset', (value) => value === true ? this.views.safety.reset().accepted : true],
      ]),
    }
  }
}

function rejectionFor(diagnostic: SignalDiagnostic): Extract<SignalUpdateResult, { accepted: false }>['reason'] {
  switch (diagnostic.code) {
    case 'invalid-enum':
      return 'invalid-enum'
    case 'out-of-range':
      return 'out-of-range'
    default:
      return 'type-mismatch'
  }
}
