import type {
  AlarmReconstruction,
  AuthorityReconstruction,
  AuthorityTimelineEvent,
  CncReconstruction,
  EquipmentReconstruction,
  FaultReconstruction,
  JobReconstruction,
  MaterialReconstruction,
  ReconstructionDiagnostic,
  ReconstructionGap,
  ReconstructionInput,
  ReconstructionRecord,
  ReconstructionSnapshot,
  RobotReconstruction,
  SignalReconstruction,
  TrajectorySample,
} from './types'
import { TIME_TRAVEL_SCHEMA_VERSION } from './types'

/**
 * Pure deterministic reconstruction engine (S41).
 *
 * `reconstructCell` folds the recorded window up to a target time and produces a
 * complete read-only cell snapshot. It performs no I/O, reads no wall clock and
 * mutates no input, so identical inputs always yield identical snapshots.
 *
 * Exactness of the robot pose is reported explicitly (see `types.ts`). Fields
 * without recorded evidence are reported as `null` and, where the whole evidence
 * class is missing, as an explicit `ReconstructionGap` — never fabricated.
 */

function ms(timestamp: string): number {
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : Number.NaN
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asJointArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const joints = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  return joints.length === value.length && joints.length > 0 ? joints : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Frozen default job state; replaced field by field as records are folded. */
function emptyJob(): JobReconstruction {
  return { sessionId: null, jobId: null, taskId: null, phase: null, progress: null, timestamp: null }
}

function emptyMaterial(): MaterialReconstruction {
  return { palletId: null, slotIndex: null, state: null, timestamp: null }
}

function emptyRobot(): RobotReconstruction {
  return { equipmentId: 'robot-1', joints: null, pose: null, exactness: 'gap', sampleTimestamp: null }
}

/**
 * Selects the robot trajectory state at `targetMs`.
 *
 * Documented approximation: between two recorded samples the joints and pose are
 * linearly interpolated (exact for constant-velocity motion, an honest
 * approximation otherwise). After the last sample the last value is held.
 */
export function reconstructRobot(trajectory: readonly TrajectorySample[], targetTime: string): RobotReconstruction {
  const targetMs = ms(targetTime)
  const samples = [...trajectory]
    .filter((sample) => Number.isFinite(ms(sample.timestamp)))
    .sort((a, b) => ms(a.timestamp) - ms(b.timestamp) || a.timestamp.localeCompare(b.timestamp))
  if (samples.length === 0 || !Number.isFinite(targetMs)) return emptyRobot()

  let before: TrajectorySample | null = null
  let after: TrajectorySample | null = null
  for (const sample of samples) {
    const sampleMs = ms(sample.timestamp)
    if (sampleMs <= targetMs) before = sample
    if (sampleMs >= targetMs) {
      after = sample
      break
    }
  }

  if (before && ms(before.timestamp) === targetMs) {
    return { equipmentId: 'robot-1', joints: [...before.joints], pose: before.pose ?? null, exactness: 'exact', sampleTimestamp: before.timestamp }
  }
  if (before && after && before !== after) {
    const span = ms(after.timestamp) - ms(before.timestamp)
    const ratio = span > 0 ? (targetMs - ms(before.timestamp)) / span : 0
    return {
      equipmentId: 'robot-1',
      joints: before.joints.map((value, index) => value + ((after!.joints[index] ?? value) - value) * ratio),
      pose: interpolatePose(before.pose ?? null, after.pose ?? null, ratio),
      exactness: 'interpolated',
      sampleTimestamp: before.timestamp,
    }
  }
  if (before) {
    // Target is after the last recorded sample: hold the last known state.
    return { equipmentId: 'robot-1', joints: [...before.joints], pose: before.pose ?? null, exactness: 'held', sampleTimestamp: before.timestamp }
  }
  // Target predates every recorded sample: no evidence, report a gap.
  return emptyRobot()
}

function interpolatePose(before: TrajectorySample['pose'], after: TrajectorySample['pose'], ratio: number) {
  if (!before || !after) return before ?? after ?? null
  const lerp = (a: number, b: number) => a + (b - a) * ratio
  return {
    x: lerp(before.x, after.x), y: lerp(before.y, after.y), z: lerp(before.z, after.z),
    rx: lerp(before.rx, after.rx), ry: lerp(before.ry, after.ry), rz: lerp(before.rz, after.rz),
  }
}

function authorityAt(events: readonly AuthorityTimelineEvent[], targetMs: number): AuthorityReconstruction | null {
  let current: AuthorityTimelineEvent | null = null
  for (const event of [...events].sort((a, b) => ms(a.timestamp) - ms(b.timestamp))) {
    if (ms(event.timestamp) <= targetMs) current = event
  }
  if (!current) return null
  return {
    scope: current.scope,
    mode: current.mode,
    state: current.state,
    ownerId: current.ownerId,
    degradedReason: current.degradedReason ?? null,
    timestamp: current.timestamp,
  }
}

/**
 * Folds ordered records into a snapshot. Records after `targetMs` are ignored.
 * Malformed records are skipped with a diagnostic and never throw.
 */
export function reconstructCell(input: ReconstructionInput, targetTime: string): ReconstructionSnapshot {
  const targetMs = ms(targetTime)
  const gaps: ReconstructionGap[] = []
  const diagnostics: ReconstructionDiagnostic[] = []
  const equipment = new Map<string, EquipmentReconstruction>()
  const signals = new Map<string, SignalReconstruction>()
  const alarms = new Map<string, AlarmReconstruction>()
  const faults = new Map<string, FaultReconstruction>()
  let cnc: CncReconstruction | null = null
  let material = emptyMaterial()
  let job = emptyJob()

  if (!Number.isFinite(targetMs)) {
    gaps.push({ field: '*', reason: 'invalid-target-time', targetTime })
  }

  const ordered = [...input.records].sort((a, b) => {
    const delta = ms(a.timestamp) - ms(b.timestamp)
    return Number.isFinite(delta) && delta !== 0 ? delta : a.sequence - b.sequence
  })

  for (const record of ordered) {
    const recordMs = ms(record.timestamp)
    if (!Number.isFinite(recordMs)) {
      diagnostics.push({ code: 'invalid-timestamp', message: `Record ${record.sequence} has an unparsable timestamp.`, sequence: record.sequence })
      continue
    }
    if (Number.isFinite(targetMs) && recordMs > targetMs) continue
    try {
      foldRecord(record, { equipment, signals, alarms, faults, setCnc: (next) => { cnc = next }, setMaterial: (next) => { material = { ...material, ...next } }, setJob: (next) => { job = { ...job, ...next } } })
    } catch (error) {
      diagnostics.push({ code: 'record-fold-failed', message: `Record ${record.sequence} could not be folded: ${error instanceof Error ? error.message : String(error)}`, sequence: record.sequence })
    }
  }

  const robot = reconstructRobot(input.trajectory, targetTime)
  if (robot.exactness === 'gap') {
    gaps.push({
      field: 'robot',
      reason: input.trajectory.length === 0 ? 'no-trajectory-samples' : 'no-sample-before-target',
      targetTime,
    })
  }

  if (input.records.length === 0 && input.trajectory.length === 0) {
    gaps.push({ field: '*', reason: 'no-history', targetTime })
  }
  if (input.authority.length === 0) {
    gaps.push({ field: 'authority', reason: 'no-authority-timeline', targetTime })
  }

  return {
    schemaVersion: TIME_TRAVEL_SCHEMA_VERSION,
    targetTime,
    source: input.source,
    sessionId: input.sessionId,
    readOnly: true,
    robot,
    cnc,
    equipment: [...equipment.values()].sort((a, b) => a.equipmentId.localeCompare(b.equipmentId)),
    material,
    signals: [...signals.values()].sort((a, b) => a.signalId.localeCompare(b.signalId)),
    alarms: [...alarms.values()].sort((a, b) => a.alarmId.localeCompare(b.alarmId)),
    faults: [...faults.values()].sort((a, b) => a.faultId.localeCompare(b.faultId)),
    job,
    authority: authorityAt(input.authority, targetMs),
    gaps,
    diagnostics,
  }
}

interface FoldTargets {
  equipment: Map<string, EquipmentReconstruction>
  signals: Map<string, SignalReconstruction>
  alarms: Map<string, AlarmReconstruction>
  faults: Map<string, FaultReconstruction>
  setCnc(next: CncReconstruction): void
  setMaterial(next: Partial<MaterialReconstruction>): void
  setJob(next: Partial<JobReconstruction>): void
}

function foldRecord(record: ReconstructionRecord, target: FoldTargets): void {
  const payload = record.payload ?? {}
  const equipmentId = record.equipmentId ?? asString(payload.equipmentId)
  const kind = record.kind

  // Job/session identifiers are carried by many record kinds.
  const jobPatch: Partial<JobReconstruction> = {}
  const sessionId = asString(payload.sessionId) ?? record.sessionId ?? null
  const jobId = asString(payload.jobId)
  const taskId = asString(payload.taskId)
  // Job/task phase is only taken from an explicit `phase` field: a raw equipment
  // state transition must not be misread as the job phase.
  const phase = asString(payload.phase)
  const progress = asNumber(payload.progress)
  if (sessionId) jobPatch.sessionId = sessionId
  if (jobId) jobPatch.jobId = jobId
  if (taskId) jobPatch.taskId = taskId
  if (phase) jobPatch.phase = phase
  if (progress !== null) jobPatch.progress = progress
  if (Object.keys(jobPatch).length > 0) {
    jobPatch.timestamp = record.timestamp
    target.setJob(jobPatch)
  }

  if (kind === 'telemetry') {
    const signalId = asString(payload.signalId)
    if (!signalId) return
    const value = payload.value
    target.signals.set(signalId, {
      signalId,
      value: typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' ? value : null,
      quality: asString(payload.quality) ?? 'good',
      source: record.source,
      timestamp: record.timestamp,
    })
    return
  }

  if (kind === 'alarm') {
    const alarmId = asString(payload.alarmId) ?? asString(payload.faultId)
    if (!alarmId) return
    const state = asString(payload.action) === 'clear' ? 'cleared' : 'raised'
    target.alarms.set(alarmId, {
      alarmId,
      code: asString(payload.code),
      severity: asString(payload.severity) ?? record.severity,
      state,
      timestamp: record.timestamp,
    })
    if (state === 'raised') {
      target.faults.set(alarmId, {
        faultId: alarmId,
        severity: asString(payload.severity) ?? record.severity,
        active: true,
        lastAction: 'raise',
        timestamp: record.timestamp,
      })
    } else {
      const fault = target.faults.get(alarmId)
      if (fault) target.faults.set(alarmId, { ...fault, active: false, lastAction: 'clear', timestamp: record.timestamp })
    }
    return
  }

  if (kind === 'acknowledgement') {
    const alarmId = asString(payload.alarmId) ?? asString(payload.faultId)
    if (!alarmId) return
    const existing = target.alarms.get(alarmId)
    target.alarms.set(alarmId, {
      alarmId,
      code: existing?.code ?? asString(payload.code),
      severity: existing?.severity ?? asString(payload.severity) ?? record.severity,
      state: 'acknowledged',
      timestamp: record.timestamp,
    })
    return
  }

  if (kind === 'fault-action') {
    const faultId = asString(payload.faultId) ?? asString(payload.alarmId)
    if (!faultId) return
    const action = asString(payload.action) ?? 'unknown'
    const existing = target.faults.get(faultId)
    const active = action === 'retry' || action === 'clear' ? false : existing?.active ?? true
    target.faults.set(faultId, {
      faultId,
      severity: existing?.severity ?? asString(payload.severity) ?? record.severity,
      active,
      lastAction: action,
      timestamp: record.timestamp,
    })
    if (action === 'reset') {
      const alarm = target.alarms.get(faultId)
      if (alarm) target.alarms.set(faultId, { ...alarm, state: 'reset', timestamp: record.timestamp })
    }
    return
  }

  if (kind !== 'state-transition' && kind !== 'command') return

  const domain = asString(payload.domain) ?? asString(payload.scope)
  const to = asString(payload.to)

  // CNC sub-state: explicit domain, equipment id or a CNC-shaped payload.
  if (domain === 'cnc' || equipmentId === 'cnc-1' || payload.cnc !== undefined) {
    const cncPayload = asRecord(payload.cnc) ?? payload
    target.setCnc({
      equipmentId: equipmentId ?? 'cnc-1',
      state: asString(cncPayload.state) ?? to,
      doorState: asString(cncPayload.doorState),
      fixtureClamped: asBoolean(cncPayload.fixtureClamped),
      spindleRunning: asBoolean(cncPayload.spindleRunning),
      partPresent: asBoolean(cncPayload.partPresent),
    })
  }

  // Material/pallet/slot position.
  if (domain === 'material' || payload.palletId !== undefined || payload.slotIndex !== undefined) {
    target.setMaterial({
      palletId: asString(payload.palletId),
      slotIndex: asNumber(payload.slotIndex),
      state: asString(payload.materialState) ?? asString(payload.state) ?? to,
      timestamp: record.timestamp,
    })
  }

  // Equipment raw state.
  if (equipmentId) {
    const previous = target.equipment.get(equipmentId)
    const measurements = asRecord(payload.measurements)
    const merged = { ...(previous?.measurements ?? {}) }
    if (measurements) {
      for (const [key, value] of Object.entries(measurements)) {
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') merged[key] = value
      }
    }
    target.equipment.set(equipmentId, {
      equipmentId,
      executionState: to ?? previous?.executionState ?? null,
      operatingMode: asString(payload.operatingMode) ?? previous?.operatingMode ?? null,
      measurements: merged,
      timestamp: record.timestamp,
    })
  }
}
