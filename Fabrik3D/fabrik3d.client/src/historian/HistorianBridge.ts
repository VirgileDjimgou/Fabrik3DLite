import type { TimelineEntry, TimelineKind, TimelineSeverity } from '../timeline/TimelineRecorder'

/**
 * Simulator-side historian bridge (S40).
 *
 * The bridge buffers selected telemetry samples and timeline events and sends them to the
 * orchestration historian as bounded batches, amortizing per-request overhead. It is disabled by
 * default: when disabled it is a pure no-op and the simulator keeps its existing local-only
 * timeline behaviour. It never issues commands and never mutates simulation state.
 */

export interface HistorianTelemetrySample {
  timestampUtc: string
  sessionId?: string
  runId?: string
  equipmentId: string
  signalId: string
  numericValue?: number
  textValue?: string
  valueType: string
  quality: string
  source: string
  origin: string
  correlationId?: string
}

export interface HistorianEventPayload {
  timestampUtc: string
  kind: string
  sessionId?: string
  equipmentId?: string
  severity: string
  code: string
  payload: string
  source: string
  sequence?: number
  correlationId?: string
}

export interface HistorianBridgeOptions {
  enabled: boolean
  batchSize: number
  flushIntervalMs: number
  maxBuffered: number
  maxPayloadChars: number
  telemetryPath: string
  eventsPath: string
}

export interface HistorianBridgeStats {
  queuedSamples: number
  queuedEvents: number
  sentDocuments: number
  droppedDocuments: number
  failedFlushes: number
  flushes: number
}

export type HistorianPost = (path: string, body: unknown) => Promise<unknown>

export const DEFAULT_HISTORIAN_OPTIONS: HistorianBridgeOptions = {
  enabled: false,
  batchSize: 100,
  flushIntervalMs: 2000,
  maxBuffered: 2000,
  maxPayloadChars: 4096,
  telemetryPath: '/historian/telemetry',
  eventsPath: '/historian/events',
}

const KIND_MAP: Record<TimelineKind, string> = {
  command: 'command',
  'state-transition': 'state-transition',
  alarm: 'alarm',
  acknowledgement: 'acknowledgement',
  telemetry: 'event',
  'fault-action': 'fault',
}

const SEVERITIES: readonly TimelineSeverity[] = ['info', 'warning', 'error', 'critical']

export class HistorianBridge {
  private readonly telemetry: HistorianTelemetrySample[] = []
  private readonly events: HistorianEventPayload[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private readonly config: HistorianBridgeOptions
  private readonly stats: HistorianBridgeStats = {
    queuedSamples: 0,
    queuedEvents: 0,
    sentDocuments: 0,
    droppedDocuments: 0,
    failedFlushes: 0,
    flushes: 0,
  }

  constructor(
    private readonly post: HistorianPost,
    options: Partial<HistorianBridgeOptions> = {},
  ) {
    this.config = { ...DEFAULT_HISTORIAN_OPTIONS, ...options }
    if (this.config.enabled) {
      this.timer = setInterval(() => { void this.flush() }, this.config.flushIntervalMs)
    }
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  /** Queues one telemetry sample. Returns false when disabled or when the bound is reached. */
  enqueueTelemetry(sample: HistorianTelemetrySample): boolean {
    if (!this.config.enabled || this.stopped) return false
    if (this.telemetry.length >= this.config.maxBuffered) {
      this.stats.droppedDocuments += 1
      return false
    }
    this.telemetry.push(sample)
    this.stats.queuedSamples += 1
    if (this.telemetry.length >= this.config.batchSize) void this.flush()
    return true
  }

  /** Maps a local timeline entry to a historian event and queues it. */
  enqueueTimelineEntry(entry: TimelineEntry): boolean {
    return this.enqueueEvent(HistorianBridge.mapTimelineEntry(entry, this.config.maxPayloadChars))
  }

  enqueueEvent(event: HistorianEventPayload): boolean {
    if (!this.config.enabled || this.stopped) return false
    if (this.events.length >= this.config.maxBuffered) {
      this.stats.droppedDocuments += 1
      return false
    }
    this.events.push(event)
    this.stats.queuedEvents += 1
    if (this.events.length >= this.config.batchSize) void this.flush()
    return true
  }

  /** Sends all buffered documents as bounded batches. Failures are counted, never thrown. */
  async flush(): Promise<void> {
    if (this.stopped) return
    const telemetry = this.telemetry.splice(0, this.telemetry.length)
    const events = this.events.splice(0, this.events.length)
    if (telemetry.length === 0 && events.length === 0) return

    try {
      for (const chunk of chunked(telemetry, this.config.batchSize)) {
        await this.post(this.config.telemetryPath, { samples: chunk })
        this.stats.sentDocuments += chunk.length
      }
      for (const chunk of chunked(events, this.config.batchSize)) {
        await this.post(this.config.eventsPath, { events: chunk })
        this.stats.sentDocuments += chunk.length
      }
      this.stats.flushes += 1
    } catch {
      // The historian is non-critical: drop the batch, count it, keep the simulator running.
      this.stats.failedFlushes += 1
      this.stats.droppedDocuments += telemetry.length + events.length
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getStats(): Readonly<HistorianBridgeStats> {
    return { ...this.stats }
  }

  /** Deterministic mapping from a local timeline entry to a historian event payload. */
  static mapTimelineEntry(entry: TimelineEntry, maxPayloadChars = DEFAULT_HISTORIAN_OPTIONS.maxPayloadChars): HistorianEventPayload {
    const severity = SEVERITIES.includes(entry.severity) ? entry.severity : 'info'
    const kind = KIND_MAP[entry.kind] ?? 'event'
    let payload: string
    try {
      payload = JSON.stringify(entry.payload ?? {})
    } catch {
      payload = '{}'
    }
    if (!payload.startsWith('{') && !payload.startsWith('[')) payload = '{}'
    if (payload.length > maxPayloadChars) {
      payload = JSON.stringify({ truncated: true, characters: payload.length })
    }
    return {
      timestampUtc: entry.timestamp,
      kind,
      sessionId: entry.sessionId || undefined,
      equipmentId: entry.equipmentId || undefined,
      severity,
      code: `${entry.kind}:${entry.source}`,
      payload,
      source: entry.source || 'simulation',
      sequence: entry.sequence,
      correlationId: entry.correlationId || undefined,
    }
  }
}

/** Creates a bridge from Vite environment configuration. Disabled unless explicitly enabled. */
export function historianBridgeFromEnv(post: HistorianPost): HistorianBridge {
  const env = import.meta.env as Record<string, string | undefined>
  const enabled = env.VITE_HISTORIAN_ENABLED === 'true'
  const batchSize = Number.parseInt(env.VITE_HISTORIAN_BATCH_SIZE ?? '', 10)
  return new HistorianBridge(post, {
    enabled,
    ...(Number.isFinite(batchSize) && batchSize > 0 ? { batchSize } : {}),
  })
}

function chunked<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const bounded = Math.max(1, size)
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += bounded) {
    chunks.push(items.slice(index, index + bounded))
  }
  return chunks
}
