import { describe, expect, it } from 'vitest'
import { reconstructCell, reconstructRobot } from './reconstruction'
import { createTimeTravelDemoInput } from './demo'
import type { ReconstructionInput, ReconstructionRecord, TrajectorySample } from './types'
import { TIME_TRAVEL_SCHEMA_VERSION } from './types'

function baseInput(overrides: Partial<ReconstructionInput> = {}): ReconstructionInput {
  return {
    schemaVersion: TIME_TRAVEL_SCHEMA_VERSION,
    sessionId: 's-1',
    source: 'local-timeline',
    records: [],
    trajectory: [],
    authority: [],
    ...overrides,
  }
}

function record(sequence: number, timestamp: string, kind: string, payload: Record<string, unknown>, equipmentId?: string): ReconstructionRecord {
  return { sequence, timestamp, kind, source: 'simulator', severity: 'info', sessionId: 's-1', equipmentId, correlationId: `c-${sequence}`, payload }
}

const trajectory: TrajectorySample[] = [
  { timestamp: '2026-01-01T00:00:00.000Z', joints: [0, 0, 0, 0, 0, 0], pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
  { timestamp: '2026-01-01T00:00:02.000Z', joints: [1, 2, 3, 4, 5, 6], pose: { x: 1, y: 2, z: 3, rx: 4, ry: 5, rz: 6 } },
]

const T = (seconds: number) => new Date(Date.parse('2026-01-01T08:00:00.000Z') + seconds * 1000).toISOString()

describe('robot trajectory reconstruction', () => {
  it('is exact on a recorded sample', () => {
    const robot = reconstructRobot(trajectory, '2026-01-01T00:00:02.000Z')
    expect(robot.exactness).toBe('exact')
    expect(robot.joints).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('interpolates linearly between two recorded samples', () => {
    const robot = reconstructRobot(trajectory, '2026-01-01T00:00:01.000Z')
    expect(robot.exactness).toBe('interpolated')
    expect(robot.joints?.[0]).toBeCloseTo(0.5, 6)
    expect(robot.pose?.x).toBeCloseTo(0.5, 6)
  })

  it('holds the last sample after the window and reports a gap before it', () => {
    expect(reconstructRobot(trajectory, '2026-01-01T00:00:05.000Z').exactness).toBe('held')
    expect(reconstructRobot(trajectory, '2025-12-31T23:59:59.000Z').exactness).toBe('gap')
  })
})

describe('deterministic reconstruction', () => {
  it('produces identical snapshots for identical input regardless of record order', () => {
    const input = createTimeTravelDemoInput()
    const target = T(9)
    const forward = reconstructCell(input, target)
    const reverse = reconstructCell({ ...input, records: [...input.records].reverse() }, target)
    expect(forward).toEqual(reverse)
  })

  it('folds CNC, equipment, material, signal, alarm, fault, job and authority state', () => {
    const input = createTimeTravelDemoInput()
    const snapshot = reconstructCell(input, T(11))
    expect(snapshot.readOnly).toBe(true)
    expect(snapshot.cnc?.state).toBe('MACHINING')
    expect(snapshot.cnc?.spindleRunning).toBe(true)
    expect(snapshot.material.slotIndex).toBe(0)
    expect(snapshot.signals.find((signal) => signal.signalId === 'conveyor-1.Running')?.value).toBe(true)
    expect(snapshot.alarms.find((alarm) => alarm.alarmId === 'alarm-1')?.state).toBe('acknowledged')
    expect(snapshot.faults.find((fault) => fault.faultId === 'alarm-1')?.active).toBe(true)
    expect(snapshot.job.phase).toBe('MOVE_TO_CNC_INSERT')
    expect(snapshot.job.progress).toBeCloseTo(0.15, 6)
    expect(snapshot.authority?.mode).toBe('external-controller')
    expect(snapshot.equipment.find((item) => item.equipmentId === 'robot-1')?.measurements.cycleStep).toBe(8)
  })

  it('requires an explicit retry to clear a reset fault', () => {
    const raised = record(1, T(0), 'alarm', { alarmId: 'f-1', severity: 'error', action: 'raise' })
    const reset = record(2, T(1), 'fault-action', { faultId: 'f-1', action: 'reset' })
    const retry = record(3, T(2), 'fault-action', { faultId: 'f-1', action: 'retry' })
    const input = baseInput({ records: [raised, reset, retry] })
    expect(reconstructCell(input, T(1)).faults.find((fault) => fault.faultId === 'f-1')?.active).toBe(true)
    const cleared = reconstructCell(input, T(3)).faults.find((fault) => fault.faultId === 'f-1')
    expect(cleared?.active).toBe(false)
    expect(cleared?.lastAction).toBe('retry')
  })

  it('never returns state recorded after the target time', () => {
    const input = createTimeTravelDemoInput()
    const snapshot = reconstructCell(input, T(3))
    expect(snapshot.material.slotIndex).toBe(0)
    expect(snapshot.cnc?.state).toBe('IDLE')
    expect(snapshot.signals).toHaveLength(0)
    expect(snapshot.faults).toHaveLength(0)
    expect(snapshot.authority?.mode).toBe('local-simulation')
  })

  it('streams later material and job state and keeps a reset fault active', () => {
    const input = createTimeTravelDemoInput()
    const snapshot = reconstructCell(input, T(20))
    expect(snapshot.faults.find((fault) => fault.faultId === 'alarm-1')?.lastAction).toBe('reset')
    expect(snapshot.material.slotIndex).toBe(1)
    expect(snapshot.job.phase).toBe('COMPLETE')
    expect(snapshot.job.progress).toBe(1)
  })

  it('reports missing history as explicit gaps and never fabricates state', () => {
    const snapshot = reconstructCell(baseInput(), T(0))
    expect(snapshot.gaps.some((gap) => gap.reason === 'no-history')).toBe(true)
    expect(snapshot.gaps.some((gap) => gap.field === 'robot' && gap.reason === 'no-trajectory-samples')).toBe(true)
    expect(snapshot.gaps.some((gap) => gap.field === 'authority')).toBe(true)
    expect(snapshot.robot.joints).toBeNull()
    expect(snapshot.cnc).toBeNull()
    expect(snapshot.signals).toEqual([])
  })

  it('skips malformed records with a diagnostic instead of crashing', () => {
    const input = baseInput({
      records: [
        record(1, 'not-a-timestamp', 'telemetry', { signalId: 'x', value: 1 }),
        record(2, T(1), 'telemetry', { signalId: 'conveyor-1.Running', value: true }),
      ],
    })
    const snapshot = reconstructCell(input, T(2))
    expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-timestamp')).toBe(true)
    expect(snapshot.signals).toHaveLength(1)
  })

  it('reports an invalid target time as a gap', () => {
    const snapshot = reconstructCell(createTimeTravelDemoInput(), 'not-a-time')
    expect(snapshot.gaps.some((gap) => gap.reason === 'invalid-target-time')).toBe(true)
  })
})
