export type TimelineSeverity = 'info' | 'warning' | 'error' | 'critical'
export type TimelineKind = 'command' | 'state-transition' | 'alarm' | 'acknowledgement' | 'telemetry' | 'fault-action'

export interface TimelineEntry {
  sequence: number
  kind: TimelineKind
  source: string
  severity: TimelineSeverity
  sessionId: string
  equipmentId: string
  timestamp: string
  correlationId: string
  /** Always true for simulator-originated records; never present real equipment data. */
  simulated: true
  payload: Record<string, unknown>
}

export interface TimelineContext {
  sessionId: string
  equipmentId: string
  correlationId: string
  source: string
}

export class TimelineRecorder {
  private sequence = 0
  private readonly entries: TimelineEntry[] = []
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  record(kind: TimelineKind, severity: TimelineSeverity, context: TimelineContext, payload: Record<string, unknown> = {}): TimelineEntry {
    const entry: TimelineEntry = {
      sequence: ++this.sequence, kind, severity, timestamp: this.now(), simulated: true,
      sessionId: context.sessionId, equipmentId: context.equipmentId,
      correlationId: context.correlationId, source: context.source, payload: { ...payload },
    }
    this.entries.push(entry)
    return entry
  }

  get all(): readonly TimelineEntry[] { return [...this.entries] }
  clear(): void { this.sequence = 0; this.entries.length = 0 }
}
