/**
 * Development-only structured logger for Fabrik3D simulator.
 *
 * All output is suppressed in production builds.
 * Provides throttled dashboard snapshots and tagged log helpers.
 */

const IS_DEV = import.meta.env.DEV

// ── Tag helpers ────────────────────────────────────────────────────

function tag(area: string, sub: string): string {
  return `[Simulator][${area}] ${sub}`
}

export function logRest(action: string, payload?: unknown): void {
  if (!IS_DEV) return
  if (payload !== undefined) {
    console.log(tag('REST', action), payload)
  } else {
    console.log(tag('REST', action))
  }
}

export function logSignalR(eventName: string, payload: unknown): void {
  if (!IS_DEV) return
  console.log(tag('SignalR', `← ${eventName}`), payload)
}

export function logBridge(action: string, payload?: unknown): void {
  if (!IS_DEV) return
  if (payload !== undefined) {
    console.log(tag('Bridge', action), payload)
  } else {
    console.log(tag('Bridge', action))
  }
}

// ── Dashboard snapshot (throttled) ─────────────────────────────────

export interface DashboardSnapshot {
  runState: string
  phase: string
  palletId: string
  materialType: string
  currentRow: number
  currentCol: number
  machinedCount: number
  remainingCount: number
  totalCount: number
  progressPercent: number
  cncState: string
  activeJobId: string | null
  activeSessionId: string | null
}

let lastSnapshotKey = ''

/**
 * Log a dashboard snapshot only when any field actually changed.
 * Prevents flooding the console during high-frequency frame updates.
 */
export function logDashboardSnapshot(snap: DashboardSnapshot): void {
  if (!IS_DEV) return
  const key = `${snap.runState}|${snap.phase}|${snap.currentRow},${snap.currentCol}|${snap.machinedCount}`
  if (key === lastSnapshotKey) return
  lastSnapshotKey = key
  console.log(tag('Dashboard', 'snapshot'), snap)
}
