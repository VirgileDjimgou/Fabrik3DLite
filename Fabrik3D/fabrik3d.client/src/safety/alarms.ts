/**
 * Structured simulation alarms for motion safety events.
 *
 * Alarms are typed records (not free-form logs) so the UI, tests, and
 * future backend reporting all consume the same contract.
 */

export const SIMULATION_ALARM_CODES = {
  COLLISION_RISK: 'COLLISION_RISK',
  SELF_COLLISION: 'SELF_COLLISION',
  UNREACHABLE_TARGET: 'UNREACHABLE_TARGET',
  JOINT_LIMIT_VIOLATION: 'JOINT_LIMIT_VIOLATION',
  INVALID_TARGET: 'INVALID_TARGET',
} as const

export type SimulationAlarmCode = (typeof SIMULATION_ALARM_CODES)[keyof typeof SIMULATION_ALARM_CODES]

export type AlarmSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface SimulationAlarm {
  id: string
  code: SimulationAlarmCode
  severity: AlarmSeverity
  message: string
  /** Equipment involved, e.g. `robot-1`, `cnc-1`, `pallet-work-object`. */
  equipmentId: string
  /** Workflow motion phase at the moment the alarm was raised. */
  phase: string
  /** Distance to the hazard in meters when known. */
  distanceMeters?: number
  timestampUtc: string
}

let alarmSequence = 0

export function nextAlarmId(): string {
  alarmSequence += 1
  return `alarm-${alarmSequence}-${Date.now().toString(36)}`
}

export function createSimulationAlarm(input: Omit<SimulationAlarm, 'id' | 'timestampUtc'>): SimulationAlarm {
  return {
    id: nextAlarmId(),
    timestampUtc: new Date().toISOString(),
    ...input,
  }
}

/** In-memory alarm log used by the simulator scene and its tests. */
export class AlarmLog {
  private readonly entries: SimulationAlarm[] = []

  onAlarm: ((alarm: SimulationAlarm) => void) | null = null

  raise(alarm: SimulationAlarm): void {
    this.entries.push(alarm)
    this.onAlarm?.(alarm)
  }

  clear(): void { this.entries.length = 0 }

  get alarms(): readonly SimulationAlarm[] { return [...this.entries] }

  get last(): SimulationAlarm | null { return this.entries[this.entries.length - 1] ?? null }
}