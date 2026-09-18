import type { NormalizedEquipmentState } from './types'
/** Replay only emits state records; it deliberately has no command interface. */
export class TelemetryReplay {
  private index = 0
  constructor(private readonly records: readonly NormalizedEquipmentState[]) {}
  reset(): void { this.index = 0 }
  advance(until: string): NormalizedEquipmentState[] { const output: NormalizedEquipmentState[] = []; while (this.index < this.records.length && this.records[this.index]!.timestamp <= until) output.push(this.records[this.index++]!); return output }
}
export function importTelemetry(json: string): NormalizedEquipmentState[] { const parsed: unknown = JSON.parse(json); if (!Array.isArray(parsed)) throw new Error('Telemetry import must be a JSON array.'); return parsed as NormalizedEquipmentState[] }
