import type { TimelineEntry } from './TimelineRecorder'

export interface ReplayState {
  sequence: number
  activeFaultIds: string[]
  acknowledgedFaultIds: string[]
  resetFaultIds: string[]
  commands: string[]
  transitions: string[]
  /** S38: overlay ids raised and not yet cleared, reconstructed read-only. */
  activeOverlayIds: string[]
  /** S38: overlay type per active overlay id, for inspection. */
  activeOverlayTypes: Record<string, string>
}

/**
 * Pure, ordered replay reducer. Fixed entries always yield the same snapshot.
 *
 * Replay is read-only: it reconstructs fault/overlay state from the recorded
 * timeline and never re-applies an overlay to live equipment or emits a command.
 */
export function replayTimeline(entries: readonly TimelineEntry[]): ReplayState {
  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence)
  const state: ReplayState = {
    sequence: 0,
    activeFaultIds: [],
    acknowledgedFaultIds: [],
    resetFaultIds: [],
    commands: [],
    transitions: [],
    activeOverlayIds: [],
    activeOverlayTypes: {},
  }
  for (const entry of ordered) {
    state.sequence = entry.sequence
    const faultId = typeof entry.payload.faultId === 'string' ? entry.payload.faultId : null
    if (entry.kind === 'alarm' && faultId && !state.activeFaultIds.includes(faultId)) state.activeFaultIds.push(faultId)
    if (entry.kind === 'acknowledgement' && faultId && !state.acknowledgedFaultIds.includes(faultId)) state.acknowledgedFaultIds.push(faultId)
    if (entry.kind === 'fault-action' && entry.payload.action === 'reset' && faultId && !state.resetFaultIds.includes(faultId)) state.resetFaultIds.push(faultId)
    if (entry.kind === 'fault-action' && entry.payload.action === 'retry' && faultId) state.activeFaultIds = state.activeFaultIds.filter(id => id !== faultId)
    if (entry.kind === 'command') state.commands.push(String(entry.payload.command ?? 'unknown'))
    if (entry.kind === 'state-transition') state.transitions.push(String(entry.payload.to ?? 'unknown'))

    // S38 overlay reconstruction: an alarm carrying a layer raises an overlay,
    // a fault-action 'clear' removes it. No command is ever emitted here.
    const layer = typeof entry.payload.layer === 'string' ? entry.payload.layer : null
    if (entry.kind === 'alarm' && faultId && layer) {
      if (!state.activeOverlayIds.includes(faultId)) state.activeOverlayIds.push(faultId)
      state.activeOverlayTypes[faultId] = String(entry.payload.type ?? 'unknown')
    }
    if (entry.kind === 'fault-action' && entry.payload.action === 'clear' && faultId) {
      state.activeOverlayIds = state.activeOverlayIds.filter(id => id !== faultId)
      delete state.activeOverlayTypes[faultId]
    }
  }
  return state
}
