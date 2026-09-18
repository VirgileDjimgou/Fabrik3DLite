import type { TimelineEntry } from './TimelineRecorder'

export interface ReplayState {
  sequence: number
  activeFaultIds: string[]
  acknowledgedFaultIds: string[]
  resetFaultIds: string[]
  commands: string[]
  transitions: string[]
}

/** Pure, ordered replay reducer. Fixed entries always yield the same snapshot. */
export function replayTimeline(entries: readonly TimelineEntry[]): ReplayState {
  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence)
  const state: ReplayState = { sequence: 0, activeFaultIds: [], acknowledgedFaultIds: [], resetFaultIds: [], commands: [], transitions: [] }
  for (const entry of ordered) {
    state.sequence = entry.sequence
    const faultId = typeof entry.payload.faultId === 'string' ? entry.payload.faultId : null
    if (entry.kind === 'alarm' && faultId && !state.activeFaultIds.includes(faultId)) state.activeFaultIds.push(faultId)
    if (entry.kind === 'acknowledgement' && faultId && !state.acknowledgedFaultIds.includes(faultId)) state.acknowledgedFaultIds.push(faultId)
    if (entry.kind === 'fault-action' && entry.payload.action === 'reset' && faultId && !state.resetFaultIds.includes(faultId)) state.resetFaultIds.push(faultId)
    if (entry.kind === 'fault-action' && entry.payload.action === 'retry' && faultId) state.activeFaultIds = state.activeFaultIds.filter(id => id !== faultId)
    if (entry.kind === 'command') state.commands.push(String(entry.payload.command ?? 'unknown'))
    if (entry.kind === 'state-transition') state.transitions.push(String(entry.payload.to ?? 'unknown'))
  }
  return state
}
