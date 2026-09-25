import { describe, expect, it } from 'vitest'
import {
  JOINT_VALUES_SIGNAL_SUFFIX,
  combineReconstructionInputs,
  loadHistorianInput,
  timelineToReconstructionInput,
  type HistorianEvent,
  type HistorianPage,
  type HistorianQueryClient,
  type HistorianQueryParams,
  type HistorianTelemetrySample,
} from './historianSource'
import { TimelineRecorder } from '../timeline/TimelineRecorder'

const T0 = '2026-01-01T08:00:00.000Z'

function paged<T>(items: T[], params: HistorianQueryParams): HistorianPage<T> {
  const skip = params.skip ?? 0
  const limit = params.limit ?? items.length
  return { items: items.slice(skip, skip + limit), totalCount: items.length, skip, limit }
}

function fakeClient(events: HistorianEvent[], telemetry: HistorianTelemetrySample[]): HistorianQueryClient {
  return {
    async queryEvents(params) { return paged(events, params) },
    async queryTelemetry(params) { return paged(telemetry, params) },
  }
}

describe('read-only historian reconstruction source', () => {
  it('maps events, telemetry, joint trajectory and authority into one input', async () => {
    const events: HistorianEvent[] = [
      { timestampUtc: T0, kind: 'state-transition', equipmentId: 'cnc-1', severity: 'info', sequence: 1, payload: '{"domain":"cnc","to":"MACHINING"}' },
      { timestampUtc: T0, kind: 'authority', code: 'authority:change', severity: 'info', sequence: 2, payload: '{"scope":"cell-1","mode":"external-controller","state":"held","ownerId":"modbus-1"}' },
      { timestampUtc: T0, kind: 'alarm', equipmentId: 'cnc-1', severity: 'warning', sequence: 3, payload: '{"alarmId":"alarm-1","action":"raise"}' },
    ]
    const telemetry: HistorianTelemetrySample[] = [
      { timestampUtc: T0, equipmentId: 'robot-1', signalId: `robot-1${JOINT_VALUES_SIGNAL_SUFFIX}`, textValue: '[0,0.1,0.2,0,0,0]' },
      { timestampUtc: T0, equipmentId: 'conveyor-1', signalId: 'conveyor-1.Running', numericValue: 1 },
    ]
    const input = await loadHistorianInput(fakeClient(events, telemetry), { sessionId: 's-1', fromUtc: T0, toUtc: T0, equipmentId: undefined })

    expect(input.source).toBe('historian')
    expect(input.trajectory).toHaveLength(1)
    expect(input.trajectory[0]!.joints).toEqual([0, 0.1, 0.2, 0, 0, 0])
    expect(input.authority).toHaveLength(1)
    expect(input.authority[0]!.mode).toBe('external-controller')
    expect(input.records.map((record) => record.kind)).toEqual(expect.arrayContaining(['state-transition', 'alarm', 'telemetry']))
  })

  it('paginates a bounded window instead of loading everything', async () => {
    const telemetry: HistorianTelemetrySample[] = Array.from({ length: 5 }, (_, index) => ({
      timestampUtc: new Date(Date.parse(T0) + index * 1000).toISOString(),
      signalId: 'conveyor-1.Running',
      numericValue: index,
    }))
    const input = await loadHistorianInput(fakeClient([], telemetry), { sessionId: 's-1', fromUtc: T0, toUtc: T0 }, { pageSize: 2 })
    expect(input.records).toHaveLength(5)
  })

  it('combines historian and local records without duplication', () => {
    const recorder = new TimelineRecorder(() => T0)
    const context = { source: 'simulator', sessionId: 's-1', equipmentId: 'robot-1', correlationId: 'c-1' }
    recorder.record('command', 'info', context, { command: 'start' })
    const local = timelineToReconstructionInput(recorder.all, 's-1')
    const shared = timelineToReconstructionInput(recorder.all, 's-1')

    const combined = combineReconstructionInputs({ ...shared, source: 'historian' }, local)
    expect(combined.records).toHaveLength(1)
    expect(combined.source).toBe('combined')
  })

  it('falls back to the local timeline when the historian window is empty', () => {
    const recorder = new TimelineRecorder(() => T0)
    recorder.record('command', 'info', { source: 'simulator', sessionId: 's-1', equipmentId: 'robot-1', correlationId: 'c-1' }, { command: 'start' })
    const local = timelineToReconstructionInput(recorder.all, 's-1')
    const emptyHistorian = timelineToReconstructionInput([], 's-1')
    const combined = combineReconstructionInputs(emptyHistorian, local)
    expect(combined.records).toHaveLength(1)
    expect(combined.source).toBe('local-timeline')
  })
})
