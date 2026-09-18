import type { NormalizedEquipmentState, TwinSource } from './types'
const priority: Record<TwinSource, number> = { commanded: 0, replay: 1, simulated: 2, observed: 3 }
export class TwinStateStore {
  private readonly states = new Map<string, NormalizedEquipmentState>()
  constructor(private readonly now: () => number = () => Date.now(), private readonly staleAfterMs = 10_000) {}
  apply(next: NormalizedEquipmentState): boolean {
    const current = this.states.get(next.equipment.id)
    if (current && Date.parse(next.timestamp) < Date.parse(current.timestamp)) return false
    if (current && Date.parse(next.timestamp) === Date.parse(current.timestamp) && priority[next.source] < priority[current.source]) return false
    const quality = this.now() - Date.parse(next.timestamp) > this.staleAfterMs ? 'stale' : current && current.source !== next.source && current.executionState !== next.executionState ? 'conflicting' : next.quality
    this.states.set(next.equipment.id, { ...next, quality }); return true
  }
  get(id: string): NormalizedEquipmentState | null { return this.states.get(id) ?? null }
  all(): readonly NormalizedEquipmentState[] { return [...this.states.values()] }
}
