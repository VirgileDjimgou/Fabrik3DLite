export type SafetyVisualState = 'safe' | 'running' | 'warning' | 'fault' | 'offline'

/** Renderer-only semantic colors; they do not claim a certified safety state. */
export function safetyVisualState(cncState: string, online = true): SafetyVisualState {
  if (!online) return 'offline'
  if (cncState === 'MACHINING') return 'running'
  if (cncState === 'LOADING' || cncState === 'UNLOADING') return 'warning'
  return 'safe'
}

export const SAFETY_VISUAL_COLORS: Record<SafetyVisualState, number> = {
  safe: 0x20a65a, running: 0x2d79d6, warning: 0xe49a16, fault: 0xd64040, offline: 0x64707a,
}
