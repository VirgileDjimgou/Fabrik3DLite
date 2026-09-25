import type { TimelineKind, TimelineSeverity } from '../timeline/TimelineRecorder'

/**
 * Deterministic industrial time travel (S41).
 *
 * These types define the versioned reconstruction snapshot and the read-only
 * inputs the engine consumes. The engine is framework-independent and pure: the
 * same input plus target time always produces the same snapshot, and nothing in
 * this module can issue a command or acquire control authority.
 *
 * Exactness is explicit: a robot pose is `exact` when a recorded trajectory
 * sample exists at the target time, `interpolated` when it is linearly
 * interpolated between two recorded samples, `held` when it holds the last
 * recorded sample, and `gap` when no earlier sample exists.
 */
export const TIME_TRAVEL_SCHEMA_VERSION = '1.0' as const

export type TimeTravelMode = 'live' | 'simulation' | 'replay'

/** Where a reconstruction window came from. Only these two read-only sources exist. */
export type ReconstructionSourceKind = 'local-timeline' | 'historian' | 'combined'

export type ReconstructionExactness = 'exact' | 'interpolated' | 'held' | 'gap'

/** Cartesian pose in SI units (meters, radians), consistent with the twin model. */
export interface CartesianPose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

/** One recorded robot trajectory sample. Joint values are SI radians. */
export interface TrajectorySample {
  timestamp: string
  joints: number[]
  pose?: CartesianPose | null
}

/** One control-authority observation on the read-only authority timeline. */
export interface AuthorityTimelineEvent {
  timestamp: string
  scope: string
  mode: string
  state: string
  ownerId: string | null
  degradedReason?: string | null
}

/**
 * A normalized record the engine can fold. It is intentionally a superset of
 * `TimelineEntry` so local timeline entries and historian events share one
 * reconstruction path. Payload conventions are documented in
 * `docs/architecture/TIME_TRAVEL.md`.
 */
export interface ReconstructionRecord {
  sequence: number
  timestamp: string
  kind: TimelineKind | string
  source: string
  severity: TimelineSeverity | string
  sessionId?: string
  equipmentId?: string
  correlationId?: string
  payload: Record<string, unknown>
}

/** A bounded, read-only reconstruction window. */
export interface ReconstructionInput {
  schemaVersion: typeof TIME_TRAVEL_SCHEMA_VERSION
  sessionId: string
  source: ReconstructionSourceKind
  records: ReconstructionRecord[]
  trajectory: TrajectorySample[]
  authority: AuthorityTimelineEvent[]
}

export interface ReconstructionGap {
  field: string
  reason: string
  targetTime: string
}

export interface ReconstructionDiagnostic {
  code: string
  message: string
  sequence?: number
}

export interface RobotReconstruction {
  /** Reference-cell robot equipment id; recorded trajectory samples are robot-scoped. */
  equipmentId: string
  joints: number[] | null
  pose: CartesianPose | null
  exactness: ReconstructionExactness
  sampleTimestamp: string | null
}

export interface CncReconstruction {
  equipmentId: string
  state: string | null
  doorState: string | null
  fixtureClamped: boolean | null
  spindleRunning: boolean | null
  partPresent: boolean | null
}

export interface EquipmentReconstruction {
  equipmentId: string
  executionState: string | null
  operatingMode: string | null
  measurements: Record<string, number | string | boolean>
  timestamp: string | null
}

export interface MaterialReconstruction {
  palletId: string | null
  slotIndex: number | null
  state: string | null
  timestamp: string | null
}

export interface SignalReconstruction {
  signalId: string
  value: number | string | boolean | null
  quality: string
  source: string
  timestamp: string
}

export interface AlarmReconstruction {
  alarmId: string
  code: string | null
  severity: string
  state: 'raised' | 'acknowledged' | 'reset' | 'cleared'
  timestamp: string
}

export interface FaultReconstruction {
  faultId: string
  severity: string
  active: boolean
  lastAction: string
  timestamp: string
}

export interface JobReconstruction {
  sessionId: string | null
  jobId: string | null
  taskId: string | null
  phase: string | null
  progress: number | null
  timestamp: string | null
}

export interface AuthorityReconstruction {
  scope: string
  mode: string
  state: string
  ownerId: string | null
  degradedReason: string | null
  timestamp: string | null
}

/** Complete, versioned, read-only cell state at one point in time. */
export interface ReconstructionSnapshot {
  schemaVersion: typeof TIME_TRAVEL_SCHEMA_VERSION
  targetTime: string
  source: ReconstructionSourceKind
  sessionId: string
  /** Always true: a reconstruction can never be applied back to live equipment. */
  readOnly: true
  robot: RobotReconstruction
  cnc: CncReconstruction | null
  equipment: EquipmentReconstruction[]
  material: MaterialReconstruction
  signals: SignalReconstruction[]
  alarms: AlarmReconstruction[]
  faults: FaultReconstruction[]
  job: JobReconstruction
  authority: AuthorityReconstruction | null
  gaps: ReconstructionGap[]
  diagnostics: ReconstructionDiagnostic[]
}

export type MarkerKind = 'alarm' | 'fault' | 'command' | 'phase'

/** A jump target derived from the recorded window: alarms, faults, commands, phase transitions. */
export interface TimelineMarker {
  id: string
  kind: MarkerKind
  sequence: number
  timestamp: string
  label: string
  severity: string
  equipmentId: string | null
}
