import type { AuthorityTimelineEvent, ReconstructionInput, ReconstructionRecord, TrajectorySample } from './types'
import { TIME_TRAVEL_SCHEMA_VERSION } from './types'

/**
 * Deterministic reference-cell reconstruction fixture for the time-travel
 * surface, unit tests and visual regression. It is simulated data only and
 * contains no real machine identifiers or secrets.
 */

const SESSION = 'time-travel-demo'
const T0 = Date.parse('2026-01-01T08:00:00.000Z')

function at(seconds: number): string {
  return new Date(T0 + seconds * 1000).toISOString()
}

function record(sequence: number, seconds: number, kind: string, equipmentId: string | undefined, severity: string, payload: Record<string, unknown>): ReconstructionRecord {
  return { sequence, timestamp: at(seconds), kind, source: 'simulator', severity, sessionId: SESSION, equipmentId, correlationId: `tt-${sequence}`, payload }
}

export function createTimeTravelDemoInput(): ReconstructionInput {
  const records: ReconstructionRecord[] = [
    record(1, 0, 'state-transition', 'cnc-1', 'info', { domain: 'cnc', to: 'IDLE', doorState: 'closed', fixtureClamped: false, spindleRunning: false, partPresent: false }),
    record(2, 0, 'state-transition', 'robot-1', 'info', { domain: 'material', to: 'RAW', palletId: 'pallet-1', slotIndex: 0, materialState: 'raw' }),
    record(3, 1, 'command', 'robot-1', 'info', { command: 'start', jobId: 'job-1', sessionId: SESSION, phase: 'IDLE', progress: 0 }),
    record(4, 2, 'state-transition', 'robot-1', 'info', { domain: 'workflow', to: 'MOVE_TO_CNC_INSERT', phase: 'MOVE_TO_CNC_INSERT', progress: 0.15, measurements: { cycleStep: 8 } }),
    record(5, 4, 'telemetry', 'conveyor-1', 'info', { signalId: 'conveyor-1.Running', value: true, quality: 'good', source: 'simulated' }),
    record(6, 5, 'state-transition', 'cnc-1', 'info', { domain: 'cnc', to: 'MACHINING', doorState: 'closed', fixtureClamped: true, spindleRunning: true, partPresent: true }),
    record(7, 6, 'telemetry', 'cnc-1', 'info', { signalId: 'cnc-1.SpindleSpeed', value: 4200, quality: 'good', source: 'simulated' }),
    record(8, 8, 'alarm', 'cnc-1', 'warning', { alarmId: 'alarm-1', code: 'CNC_TEMP_HIGH', severity: 'warning', action: 'raise' }),
    record(9, 10, 'acknowledgement', 'cnc-1', 'info', { alarmId: 'alarm-1' }),
    record(10, 11, 'state-transition', 'cnc-1', 'info', { domain: 'cnc', to: 'MACHINING', doorState: 'closed', fixtureClamped: true, spindleRunning: true, partPresent: true }),
    record(11, 12, 'state-transition', 'robot-1', 'info', { domain: 'material', to: 'MACHINED', palletId: 'pallet-1', slotIndex: 1, materialState: 'machined' }),
    record(12, 14, 'fault-action', 'cnc-1', 'info', { faultId: 'alarm-1', action: 'reset', severity: 'warning' }),
    record(13, 15, 'state-transition', 'cnc-1', 'info', { domain: 'cnc', to: 'IDLE', doorState: 'open', fixtureClamped: false, spindleRunning: false, partPresent: false }),
    record(14, 16, 'telemetry', 'cnc-1', 'info', { signalId: 'cnc-1.SpindleSpeed', value: 0, quality: 'good', source: 'simulated' }),
    record(15, 18, 'command', 'robot-1', 'info', { command: 'stop', phase: 'COMPLETE', progress: 1 }),
  ]

  const joints: Array<[number, number[]]> = [
    [0, [0, 0, 0, 0, 0, 0]],
    [2, [0.2, -0.4, 0.9, 0, 0.6, 0]],
    [4, [0.4, -0.6, 1.2, 0.1, 0.9, 0.2]],
    [6, [0.6, -0.5, 1.4, 0.2, 1.1, 0.3]],
    [8, [0.6, -0.5, 1.4, 0.2, 1.1, 0.3]],
    [12, [0.3, -0.3, 1.0, 0.1, 0.7, 0.1]],
    [15, [0, 0, 0, 0, 0, 0]],
  ]
  const trajectory: TrajectorySample[] = joints.map(([seconds, values]) => ({
    timestamp: at(seconds),
    joints: values,
    pose: { x: 0.4 + (values[0] ?? 0), y: 0.2, z: 0.8 - (values[2] ?? 0) * 0.1, rx: 0, ry: 0, rz: values[5] ?? 0 },
  }))

  const authority: AuthorityTimelineEvent[] = [
    { timestamp: at(0), scope: 'cell-1', mode: 'local-simulation', state: 'available', ownerId: null },
    { timestamp: at(5), scope: 'cell-1', mode: 'external-controller', state: 'held', ownerId: 'modbus-connector-1' },
    { timestamp: at(12), scope: 'cell-1', mode: 'local-simulation', state: 'available', ownerId: null, degradedReason: 'external controller released' },
  ]

  return { schemaVersion: TIME_TRAVEL_SCHEMA_VERSION, sessionId: SESSION, source: 'local-timeline', records, trajectory, authority }
}
