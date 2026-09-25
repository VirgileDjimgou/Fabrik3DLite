import type { MarkerKind, ReconstructionRecord, TimelineMarker } from './types'

/**
 * Deterministic marker extraction (S41).
 *
 * Markers are jump targets for alarms, fault actions, commands and phase
 * transitions. They are derived from the recorded window only and never from
 * live state. Extraction is stable: records are ordered by timestamp then
 * sequence, and identical input yields an identical marker list.
 */

const KIND_MAP: Record<string, MarkerKind> = {
  alarm: 'alarm',
  'fault-action': 'fault',
  command: 'command',
  'state-transition': 'phase',
}

function ms(timestamp: string): number {
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function labelFor(kind: MarkerKind, record: ReconstructionRecord): string {
  const payload = record.payload ?? {}
  switch (kind) {
    case 'alarm':
      return String(payload.alarmId ?? payload.faultId ?? payload.code ?? 'alarm')
    case 'fault': {
      const action = payload.action ?? 'action'
      const faultId = payload.faultId ?? payload.alarmId ?? 'fault'
      return `${action}:${faultId}`
    }
    case 'command':
      return String(payload.command ?? 'command')
    case 'phase':
      return String(payload.to ?? payload.phase ?? 'transition')
  }
}

export function extractMarkers(records: readonly ReconstructionRecord[]): TimelineMarker[] {
  const markers: TimelineMarker[] = []
  const ordered = [...records].sort((a, b) => ms(a.timestamp) - ms(b.timestamp) || a.sequence - b.sequence)
  for (const record of ordered) {
    const kind = KIND_MAP[record.kind]
    if (!kind) continue
    markers.push({
      id: `${kind}-${record.sequence}`,
      kind,
      sequence: record.sequence,
      timestamp: record.timestamp,
      label: labelFor(kind, record),
      severity: record.severity ?? 'info',
      equipmentId: record.equipmentId ?? null,
    })
  }
  return markers
}

/** Inclusive time range of a recorded window plus its trajectory, in epoch milliseconds. */
export function windowRange(records: readonly ReconstructionRecord[], trajectory: readonly { timestamp: string }[]): { startMs: number; endMs: number } | null {
  const values = [...records.map((record) => Date.parse(record.timestamp)), ...trajectory.map((sample) => Date.parse(sample.timestamp))]
    .filter((value) => Number.isFinite(value))
  if (values.length === 0) return null
  return { startMs: Math.min(...values), endMs: Math.max(...values) }
}
