import type { TimelineEntry } from '../timeline/TimelineRecorder'
import type {
  AuthorityTimelineEvent,
  ReconstructionInput,
  ReconstructionRecord,
  TrajectorySample,
} from './types'
import { TIME_TRAVEL_SCHEMA_VERSION } from './types'

/**
 * Read-only historian reconstruction source (S41).
 *
 * The simulator can reconstruct a window from the S40 historian (telemetry
 * samples + historized events) or from its local in-memory timeline. The two are
 * combined without duplication: records are keyed by correlation id, sequence and
 * kind, and the historian wins on collision. Queries are read-only, filtered,
 * bounded and paginated; no command endpoint is ever called.
 */

export interface HistorianTelemetrySample {
  id?: string
  timestampUtc?: string
  sessionId?: string | null
  equipmentId?: string
  signalId?: string
  numericValue?: number | null
  textValue?: string | null
  valueType?: string
  quality?: string
  source?: string
  correlationId?: string | null
}

export interface HistorianEvent {
  id?: string
  timestampUtc?: string
  kind?: string
  sessionId?: string | null
  equipmentId?: string | null
  severity?: string
  code?: string
  payload?: string
  source?: string
  sequence?: number | null
  correlationId?: string | null
}

export interface HistorianPage<T> {
  items?: T[]
  totalCount?: number
  skip?: number
  limit?: number
}

export interface HistorianQueryParams {
  sessionId?: string
  equipmentId?: string
  fromUtc?: string
  toUtc?: string
  skip?: number
  limit?: number
}

export interface HistorianQueryClient {
  queryTelemetry(params: HistorianQueryParams): Promise<HistorianPage<HistorianTelemetrySample>>
  queryEvents(params: HistorianQueryParams & { kind?: string }): Promise<HistorianPage<HistorianEvent>>
}

export interface HistorianWindowFilter {
  sessionId: string
  fromUtc: string
  toUtc: string
  equipmentId?: string
}

export interface LoadHistorianOptions {
  pageSize?: number
  maxDocuments?: number
}

export const DEFAULT_HISTORIAN_WINDOW_LIMIT = 1000
/** Signal id convention for a recorded joint array: one sample per timestamp, JSON array of radians. */
export const JOINT_VALUES_SIGNAL_SUFFIX = '.jointValues'

const EVENT_KIND_MAP: Record<string, string> = {
  command: 'command',
  'state-transition': 'state-transition',
  alarm: 'alarm',
  acknowledgement: 'acknowledgement',
  fault: 'fault-action',
  event: 'telemetry',
  telemetry: 'telemetry',
  authority: 'authority',
}

function safeJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function eventToRecord(event: HistorianEvent): ReconstructionRecord | null {
  const kind = EVENT_KIND_MAP[event.kind ?? ''] ?? 'event'
  if (kind === 'authority') return null
  const timestamp = event.timestampUtc
  if (!timestamp) return null
  return {
    sequence: typeof event.sequence === 'number' ? event.sequence : 0,
    timestamp,
    kind,
    source: event.source ?? 'historian',
    severity: event.severity ?? 'info',
    sessionId: event.sessionId ?? undefined,
    equipmentId: event.equipmentId ?? undefined,
    correlationId: event.correlationId ?? undefined,
    payload: safeJson(event.payload),
  }
}

function eventToAuthority(event: HistorianEvent): AuthorityTimelineEvent | null {
  if (EVENT_KIND_MAP[event.kind ?? ''] !== 'authority' && !(event.code ?? '').startsWith('authority')) return null
  if (!event.timestampUtc) return null
  const payload = safeJson(event.payload)
  const owner = payload.ownerId
  return {
    timestamp: event.timestampUtc,
    scope: typeof payload.scope === 'string' ? payload.scope : 'cell-1',
    mode: typeof payload.mode === 'string' ? payload.mode : 'unknown',
    state: typeof payload.state === 'string' ? payload.state : 'unknown',
    ownerId: typeof owner === 'string' ? owner : null,
    degradedReason: typeof payload.degradedReason === 'string' ? payload.degradedReason : null,
  }
}

function telemetryToRecord(sample: HistorianTelemetrySample): ReconstructionRecord | null {
  if (!sample.timestampUtc || !sample.signalId) return null
  return {
    sequence: 0,
    timestamp: sample.timestampUtc,
    kind: 'telemetry',
    source: sample.source ?? 'historian',
    severity: 'info',
    sessionId: sample.sessionId ?? undefined,
    equipmentId: sample.equipmentId ?? undefined,
    correlationId: sample.correlationId ?? undefined,
    payload: { signalId: sample.signalId, value: sample.numericValue ?? sample.textValue ?? null, quality: sample.quality ?? 'good' },
  }
}

function telemetryToTrajectory(sample: HistorianTelemetrySample): TrajectorySample | null {
  if (!sample.timestampUtc || !sample.signalId) return null
  if (!sample.signalId.toLowerCase().endsWith(JOINT_VALUES_SIGNAL_SUFFIX.toLowerCase())) return null
  if (!sample.textValue) return null
  try {
    const parsed: unknown = JSON.parse(sample.textValue)
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
    return { timestamp: sample.timestampUtc, joints: parsed as number[] }
  } catch {
    return null
  }
}

/**
 * Loads a bounded read-only reconstruction window from the historian. Pagination
 * stops at `maxDocuments`; the caller is responsible for keeping the window small.
 */
export async function loadHistorianInput(
  client: HistorianQueryClient,
  filter: HistorianWindowFilter,
  options: LoadHistorianOptions = {},
): Promise<ReconstructionInput> {
  const pageSize = Math.max(1, options.pageSize ?? 200)
  const maxDocuments = Math.max(1, options.maxDocuments ?? DEFAULT_HISTORIAN_WINDOW_LIMIT)
  const base: HistorianQueryParams = {
    sessionId: filter.sessionId || undefined,
    equipmentId: filter.equipmentId,
    fromUtc: filter.fromUtc,
    toUtc: filter.toUtc,
  }

  const records: ReconstructionRecord[] = []
  const trajectory: TrajectorySample[] = []
  const authority: AuthorityTimelineEvent[] = []

  let skip = 0
  while (records.length + trajectory.length < maxDocuments) {
    const page = await client.queryEvents({ ...base, skip, limit: pageSize })
    const items = page.items ?? []
    for (const event of items) {
      const authorityEvent = eventToAuthority(event)
      if (authorityEvent) {
        authority.push(authorityEvent)
        continue
      }
      const record = eventToRecord(event)
      if (record) records.push(record)
    }
    if (items.length < pageSize) break
    skip += pageSize
  }

  skip = 0
  while (records.length + trajectory.length < maxDocuments) {
    const page = await client.queryTelemetry({ ...base, skip, limit: pageSize })
    const items = page.items ?? []
    for (const sample of items) {
      const sampleTrajectory = telemetryToTrajectory(sample)
      if (sampleTrajectory) {
        trajectory.push(sampleTrajectory)
        continue
      }
      const record = telemetryToRecord(sample)
      if (record) records.push(record)
    }
    if (items.length < pageSize) break
    skip += pageSize
  }

  return {
    schemaVersion: TIME_TRAVEL_SCHEMA_VERSION,
    sessionId: filter.sessionId,
    source: 'historian',
    records,
    trajectory,
    authority,
  }
}

/** Adapts the local in-memory timeline to the reconstruction input. */
export function timelineToReconstructionInput(
  entries: readonly TimelineEntry[],
  sessionId: string,
  extras: { trajectory?: readonly TrajectorySample[]; authority?: readonly AuthorityTimelineEvent[] } = {},
): ReconstructionInput {
  return {
    schemaVersion: TIME_TRAVEL_SCHEMA_VERSION,
    sessionId,
    source: 'local-timeline',
    records: entries.map((entry) => ({
      sequence: entry.sequence,
      timestamp: entry.timestamp,
      kind: entry.kind,
      source: entry.source,
      severity: entry.severity,
      sessionId: entry.sessionId,
      equipmentId: entry.equipmentId,
      correlationId: entry.correlationId,
      payload: { ...entry.payload },
    })),
    trajectory: [...(extras.trajectory ?? [])],
    authority: [...(extras.authority ?? [])],
  }
}

function recordKey(record: ReconstructionRecord): string {
  return record.correlationId
    ? `${record.correlationId}:${record.sequence}:${record.kind}`
    : `${record.timestamp}:${record.sequence}:${record.kind}:${record.source}`
}

/**
 * Combines a historian window with the local timeline without duplication. The
 * historian (primary) wins on collision; local records not present in it are
 * appended. Trajectory samples are de-duplicated by timestamp.
 */
export function combineReconstructionInputs(primary: ReconstructionInput, secondary: ReconstructionInput): ReconstructionInput {
  if (primary.records.length === 0 && primary.trajectory.length === 0) {
    return { ...secondary, source: secondary.source === 'historian' ? 'historian' : 'local-timeline' }
  }
  const seenRecords = new Set(primary.records.map(recordKey))
  const mergedRecords = [...primary.records]
  for (const record of secondary.records) {
    const key = recordKey(record)
    if (!seenRecords.has(key)) {
      seenRecords.add(key)
      mergedRecords.push(record)
    }
  }
  const seenTimestamps = new Set(primary.trajectory.map((sample) => sample.timestamp))
  const mergedTrajectory = [...primary.trajectory]
  for (const sample of secondary.trajectory) {
    if (!seenTimestamps.has(sample.timestamp)) {
      seenTimestamps.add(sample.timestamp)
      mergedTrajectory.push(sample)
    }
  }
  const seenAuthority = new Set(primary.authority.map((event) => `${event.timestamp}:${event.scope}`))
  const mergedAuthority = [...primary.authority]
  for (const event of secondary.authority) {
    const key = `${event.timestamp}:${event.scope}`
    if (!seenAuthority.has(key)) {
      seenAuthority.add(key)
      mergedAuthority.push(event)
    }
  }
  return {
    schemaVersion: TIME_TRAVEL_SCHEMA_VERSION,
    sessionId: primary.sessionId || secondary.sessionId,
    source: primary.records.length > 0 || primary.trajectory.length > 0 ? (secondary.records.length > 0 || secondary.trajectory.length > 0 ? 'combined' : primary.source) : secondary.source,
    records: mergedRecords,
    trajectory: mergedTrajectory,
    authority: mergedAuthority,
  }
}
