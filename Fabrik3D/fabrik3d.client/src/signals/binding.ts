import type { SignalRegistry } from './SignalRegistry'
import {
  FEED_NOMINAL_MM_PER_MIN,
  SPINDLE_NOMINAL_RPM,
} from '../simulation/CncCycleMachine'
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
  /** S39 optional fine-grained cycle reads; absent views fall back to `getState()`. */
  getPhase?(): string
  getDoorLocked?(): boolean
  getSpindleSpeed?(): number
  isSpindleAtSpeed?(): boolean
  getFeedRate?(): number
  isFeedActive?(): boolean
  isCoolantOn?(): boolean
  getCycleStep?(): number
  getFixtureClamped?(): boolean
  getPartPresent?(): boolean
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
  /** S39 optional material-flow reads; absent views report zero. */
  getRawSlotsRemaining?(): number
  getMachinedSlots?(): number
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

/**
 * Optional S38 overlay hook. When provided, the binding applies the active fault
 * overlays to every published signal. The canonical definition and the stored
 * sample are never mutated: the overlay is applied to the value on its way out.
 */
export interface SignalOverlayHook {
  apply(
    signalId: string,
    value: SignalValue,
    quality: import('./types').SignalQuality,
    safeValue: SignalValue,
    numeric: boolean,
  ): { value: SignalValue; quality: import('./types').SignalQuality }
  /** Advances the deterministic tick used by seeded patterns. */
  advanceTick?(): void
  /**
   * True when an active fault overlay owns this signal. A command write is then
   * refused before it can reach the runtime or a connector writer.
   */
  blocksCommand?(signalId: string): boolean
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
  /** Optional S38 fault-overlay hook applied when publishing signals. */
  overlays?: SignalOverlayHook | null
}

export type SignalCoverageReason = 'missing-writer' | 'unbound-equipment'

export interface SignalCoverageDiagnostic {
  signalId: string
  equipmentId: string
  reason: SignalCoverageReason
}

/** Nominal simulated machining values, consistent with the CNC cycle machine. */
export const SIMULATED_SPINDLE_SPEED_RPM = SPINDLE_NOMINAL_RPM
export const SIMULATED_FEED_RATE_MM_PER_MIN = FEED_NOMINAL_MM_PER_MIN

const GRIP_PHASES = new Set(['PICK_PART', 'LOAD_PART', 'RETRIEVE_PART', 'PLACE_PART_BACK'])
const WORKFLOW_PHASE_ORDER = [
  'IDLE', 'SELECT_NEXT_SLOT', 'MOVE_ABOVE_PALLET_SLOT', 'DESCEND_TO_PICK', 'PICK_PART', 'LIFT_FROM_PALLET',
  'MOVE_TO_CNC_APPROACH', 'OPEN_CNC_DOOR', 'MOVE_TO_CNC_INSERT', 'LOAD_PART', 'RETRACT_FROM_CNC',
  'CLOSE_CNC_DOOR', 'MACHINING', 'OPEN_CNC_DOOR_RETRIEVE', 'MOVE_TO_CNC_RETRIEVE', 'RETRIEVE_PART',
  'LIFT_FROM_CNC', 'MOVE_ABOVE_ORIGIN_SLOT', 'DESCEND_TO_ORIGIN_SLOT', 'PLACE_PART_BACK', 'LIFT_AFTER_PLACE',
  'NEXT_SLOT', 'COMPLETE',
] as const

/** Deterministic fallback step index derived from the coarse CNC state. */
function cncStateStep(state: string): number {
  switch (state) {
    case 'LOADING': return 2
    case 'MACHINING': return 5
    case 'UNLOADING': return 8
    default: return 0
  }
}

function workflowStep(phase: string): number {
  const index = WORKFLOW_PHASE_ORDER.indexOf(phase as (typeof WORKFLOW_PHASE_ORDER)[number])
  return index < 0 ? 0 : index
}

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
  private readonly overlays: SignalOverlayHook | null
  private readonly channels: SignalChannel[]
  private readonly writersBySignalId = new Map<string, CommandWriter>()
  private disposed = false

  constructor(options: ReferenceCellSignalBindingOptions) {
    this.registry = options.registry
    this.views = options.views
    this.now = options.now ?? (() => Date.now())
    this.overlays = options.overlays ?? null
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
    this.overlays?.advanceTick?.()
    for (const channel of this.channels) {
      for (const [name, read] of channel.readers) {
        const signalId = `${channel.equipmentId}.${name}`
        const definition = this.registry.getDefinition(signalId)
        if (!definition) continue
        const value = read()
        if (validateSignalValue(definition, value)) continue
        // S38: apply the active fault overlays on the way out. The canonical
        // definition and the stored sample stay untouched; removing an overlay
        // restores the exact pre-fault value/quality on the next tick.
        const published = this.overlays
          ? this.overlays.apply(signalId, value, 'good', definition.safeValue ?? definition.defaultValue, isNumericDefinition(definition))
          : { value, quality: 'good' as const }
        this.registry.update({ signalId, value: published.value, source: 'simulated', origin: 'simulation', timestamp, quality: published.quality })
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
    // S38: a signal owned by an active fault overlay refuses external commands.
    // The runtime/connector writer is never reached, so injection cannot
    // propagate an arbitrary write into live machinery.
    if (this.overlays?.blocksCommand?.(signalId)) {
      return { accepted: false, reason: 'runtime-rejected', message: `Signal '${signalId}' is under an active simulated fault overlay; command refused.` }
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
        ['Dwell', () => GRIP_PHASES.has(this.views.robot.getWorkflowPhase())],
        ['CycleStep', () => workflowStep(this.views.robot.getWorkflowPhase())],
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
    const spindleSpeed = () => this.views.cnc.getSpindleSpeed?.() ?? (machineState() === 'MACHINING' ? SPINDLE_NOMINAL_RPM : 0)
    const feedRate = () => this.views.cnc.getFeedRate?.() ?? (machineState() === 'MACHINING' ? FEED_NOMINAL_MM_PER_MIN : 0)
    const fixtureClamped = () => this.views.cnc.getFixtureClamped?.() ?? (machineState() === 'MACHINING' || machineState() === 'UNLOADING')
    const partPresent = () => this.views.cnc.getPartPresent?.() ?? machineState() !== 'IDLE'
    return {
      equipmentId,
      readers: new Map<string, SignalReader>([
        ['Ready', () => machineState() === 'IDLE' && doorState() === 'closed' && !faulted() && !this.views.safety.isEmergencyStop()],
        ['DoorOpen', () => doorState() === 'open'],
        ['DoorClosed', () => doorState() === 'closed'],
        ['DoorLocked', () => this.views.cnc.getDoorLocked?.() ?? doorState() === 'closed'],
        ['FixtureClamped', fixtureClamped],
        ['PartPresent', partPresent],
        ['CycleRunning', () => machineState() === 'MACHINING'],
        ['CycleComplete', () => machineState() === 'UNLOADING'],
        ['CycleStep', () => this.views.cnc.getCycleStep?.() ?? cncStateStep(machineState())],
        ['SpindleRunning', () => machineState() === 'MACHINING'],
        ['SpindleAtSpeed', () => this.views.cnc.isSpindleAtSpeed?.() ?? machineState() === 'MACHINING'],
        ['SpindleSpeed', spindleSpeed],
        ['FeedActive', () => this.views.cnc.isFeedActive?.() ?? machineState() === 'MACHINING'],
        ['FeedRate', feedRate],
        ['CoolantOn', () => this.views.cnc.isCoolantOn?.() ?? machineState() === 'MACHINING'],
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
        ['RawSlotsRemaining', () => this.views.conveyor.getRawSlotsRemaining?.() ?? 0],
        ['MachinedSlots', () => this.views.conveyor.getMachinedSlots?.() ?? 0],
        ['SpeedDeviation', () => Math.abs(this.views.conveyor.getActualSpeed() - this.views.conveyor.getSpeedReference())],
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
        ['SafetyResetRequired', () => this.views.safety.isEmergencyStop() || !this.views.safety.isHealthy()],
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

function isNumericDefinition(definition: { dataType: string }): boolean {
  return definition.dataType === 'int' || definition.dataType === 'uint' || definition.dataType === 'float'
}
