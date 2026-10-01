import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as api from '@/services/api'
import type { ControlAuthorityDto, RobotPositionsDto } from '@/services/api'
import { DEFAULT_CELL_ID, DEFAULT_ROBOT_ID, ROBOT_POLL_INTERVAL_MS } from '@/config/cell'
import { useControlAuthority } from './useControlAuthority'
import { useOperatingMode, type OperatingMode } from './useOperatingMode'

/** Connectivity of the authoritative robot state, distinct from the hub connection. */
export type RobotTelemetryState = 'loading' | 'ready' | 'unavailable' | 'offline'

/** Stable, translatable reasons a jog is not available. */
export type JogBlockReason = 'no-telemetry' | 'stale' | 'offline' | 'mode' | 'authority'

export type JogFeedback = 'idle' | 'pending' | 'success' | 'failure'

export interface JogAvailabilityInput {
  positions: RobotPositionsDto | null
  telemetry: RobotTelemetryState
  authority: ControlAuthorityDto | null
  mode: OperatingMode
}

/** Pure gating rule shared by the composable and the tests. */
export function jogAvailability(input: JogAvailabilityInput): { allowed: boolean; reason: JogBlockReason | null } {
  const { positions, telemetry, authority, mode } = input
  if (telemetry === 'offline') return { allowed: false, reason: 'offline' }
  if (telemetry !== 'ready' || !positions) return { allowed: false, reason: 'no-telemetry' }
  if (positions.isStale) return { allowed: false, reason: 'stale' }
  if (positions.operatingMode !== 'manual-training' || mode !== 'manual-training') {
    return { allowed: false, reason: 'mode' }
  }
  const held = authority?.state === 'held'
  const commanding = authority?.mode === 'local-simulation' || authority?.mode === 'external-controller'
  if (!held || !commanding) return { allowed: false, reason: 'authority' }
  return { allowed: true, reason: null }
}

function newDeadManToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `dm-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Authoritative robot positions and operator jog for the HMI (S53).
 *
 * Polling is deliberate: the server owns the state and a 1 s poll keeps a jog visually live without
 * a broad SignalR broadcast. A press is a real dead-man hold; release is sent on pointer/key up,
 * focus loss, visibility change, authority loss, disconnect and unmount.
 */
export function useRobotPositions(options: { cellId?: string; robotId?: string } = {}) {
  const cellId = options.cellId ?? DEFAULT_CELL_ID
  const robotId = options.robotId ?? DEFAULT_ROBOT_ID

  const positions = ref<RobotPositionsDto | null>(null)
  const telemetry = ref<RobotTelemetryState>('loading')
  const activeJoint = ref<string | null>(null)
  const feedback = ref<JogFeedback>('idle')
  const feedbackMessage = ref<string | null>(null)

  const { authority, refresh: refreshAuthority } = useControlAuthority()
  const { mode } = useOperatingMode()

  let timer: ReturnType<typeof setInterval> | null = null
  let deadManToken: string | null = null

  const availability = computed(() => jogAvailability({
    positions: positions.value,
    telemetry: telemetry.value,
    authority: authority.value,
    mode: mode.value,
  }))

  async function refresh(): Promise<void> {
    try {
      positions.value = await api.getRobotPositions(cellId, robotId)
      telemetry.value = 'ready'
    } catch (error) {
      // A 404 means no simulator ever published; any other failure is an offline/degraded state.
      const status = (error as { status?: number }).status
      if (status === 404) {
        positions.value = null
        telemetry.value = 'unavailable'
      } else {
        telemetry.value = 'offline'
      }
    }
  }

  async function release(reason?: string): Promise<void> {
    const joint = activeJoint.value ?? 'J1'
    const wasActive = activeJoint.value !== null
    activeJoint.value = null
    deadManToken = null
    if (!wasActive) return
    try {
      await api.issueJog(cellId, robotId, {
        robotId, joint, direction: 1, action: 'release', deadManToken: null, mode: mode.value,
      })
      feedback.value = 'success'
      feedbackMessage.value = reason ?? null
    } catch {
      feedback.value = 'failure'
      feedbackMessage.value = 'release_failed'
    }
  }

  async function press(joint: string, direction: -1 | 1): Promise<void> {
    if (!availability.value.allowed) {
      feedback.value = 'failure'
      feedbackMessage.value = availability.value.reason
      return
    }
    deadManToken = newDeadManToken()
    activeJoint.value = joint
    feedback.value = 'pending'
    feedbackMessage.value = null
    try {
      await api.issueJog(cellId, robotId, {
        robotId, joint, direction, action: 'press', deadManToken, mode: 'manual-training',
      })
      // A press is a hold; success means the server accepted the intent, not that motion ended.
      feedback.value = 'success'
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'jog_rejected'
      activeJoint.value = null
      deadManToken = null
      feedback.value = 'failure'
      feedbackMessage.value = code
    }
  }

  function start(): void {
    void refresh()
    void refreshAuthority()
    if (timer) return
    timer = setInterval(() => { void refresh() }, ROBOT_POLL_INTERVAL_MS)
  }

  function stop(): void {
    if (timer) { clearInterval(timer); timer = null }
    void release('view-closed')
  }

  // Safety watchdog: any authority loss or mode change mid-jog stops motion immediately.
  watch(availability, (next, previous) => {
    if (previous.allowed && !next.allowed && activeJoint.value !== null) {
      void release(next.reason ?? 'authority-loss')
    }
  })

  onMounted(start)
  onUnmounted(() => {
    if (timer) { clearInterval(timer); timer = null }
    // Leaving the surface must never leave a dead-man held.
    void release('view-closed')
  })

  return {
    cellId, robotId,
    positions, telemetry, activeJoint, feedback, feedbackMessage, availability,
    refresh, press, release, start, stop,
  }
}
