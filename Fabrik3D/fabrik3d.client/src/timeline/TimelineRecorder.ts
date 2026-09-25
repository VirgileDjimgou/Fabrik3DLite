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

  /**
   * @param now deterministic clock (defaults to the system clock)
   * @param onRecord optional non-critical sink (for example the S40 historian bridge). A sink
   * exception must never break the simulation, so it is swallowed.
   */
  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly onRecord?: (entry: TimelineEntry) => void,
  ) {}

  record(kind: TimelineKind, severity: TimelineSeverity, context: TimelineContext, payload: Record<string, unknown> = {}): TimelineEntry {
    const entry: TimelineEntry = {
      sequence: ++this.sequence, kind, severity, timestamp: this.now(), simulated: true,
      sessionId: context.sessionId, equipmentId: context.equipmentId,
      correlationId: context.correlationId, source: context.source, payload: { ...payload },
    }
    this.entries.push(entry)
    try {
      this.onRecord?.(entry)
    } catch {
      // The sink (historian bridge) is non-critical and never affects local timeline semantics.
    }
    return entry
  }

  get all(): readonly TimelineEntry[] { return [...this.entries] }
  clear(): void { this.sequence = 0; this.entries.length = 0 }
}
