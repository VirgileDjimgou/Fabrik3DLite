import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { MachineStateDto, JobDto, SimulationSessionDto } from '@/services/api'
import type { ConnectionState, MachineStateChangedEvent, SimulationStateChangedEvent } from '@/services/hub'

// ── Shared singleton state (all components see the same refs) ──

const machine = ref<MachineStateDto | null>(null)
const currentJob = ref<JobDto | null>(null)
const session = ref<SimulationSessionDto | null>(null)
const connectionState = ref<ConnectionState>('disconnected')

let refCount = 0
let unsub: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// ── REST refreshes (fallback / initial load) ──

async function refreshMachine() {
  try { const m = await api.getCurrentMachineState(); if (m) machine.value = m }
  catch { /* offline */ }
}

async function refreshJob() {
  try {
    const jobs = await api.getJobs()
    const active = jobs.find(j => j.status === 'Running' || j.status === 'Paused')
    currentJob.value = active ?? null
    if (active?.simulationSessionId) {
      try { session.value = await api.getSessionById(active.simulationSessionId) }
      catch { session.value = null }
    } else { session.value = null }
  } catch { /* offline */ }
}

// ── Direct event application (instant UI update) ──

function applyMachineEvent(e: MachineStateChangedEvent): void {
  const prev = machine.value
  machine.value = {
    id: e.machineStateId,
    simulationSessionId: prev?.simulationSessionId ?? null,
    machineMode: e.machineMode,
    simulationStatus: e.simulationStatus,
    robotState: e.robotState,
    cncState: e.cncState,
    currentPhase: e.currentPhase,
    currentPalletId: prev?.currentPalletId ?? null,
    currentTaskId: prev?.currentTaskId ?? null,
    currentPartId: prev?.currentPartId ?? null,
    currentSlotRow: prev?.currentSlotRow ?? 0,
    currentSlotColumn: prev?.currentSlotColumn ?? 0,
    isRunning: e.isRunning,
    isPaused: e.isPaused,
    lastUpdatedAtUtc: e.timestampUtc,
  }
}

function applySimulationEvent(e: SimulationStateChangedEvent): void {
  const prev = session.value
  session.value = {
    id: e.sessionId,
    jobId: e.jobId,
    status: e.status,
    startedAtUtc: prev?.startedAtUtc ?? e.timestampUtc,
    endedAtUtc: prev?.endedAtUtc ?? null,
    isPaused: e.status === 'Paused',
    currentPhase: e.currentPhase,
    currentPalletId: prev?.currentPalletId ?? null,
    currentTaskId: prev?.currentTaskId ?? null,
    currentPartId: prev?.currentPartId ?? null,
    machinedCount: e.machinedCount,
    remainingCount: e.remainingCount,
    totalCount: e.totalCount,
    lastHeartbeatUtc: e.timestampUtc,
  }
}

// ── Lifecycle ──

function init() {
  unsub = hub.subscribe({
    onMachineStateChanged: (e) => applyMachineEvent(e),
    onJobStateChanged: () => { void refreshJob() },
    onSimulationStateChanged: (e) => { applySimulationEvent(e); void refreshJob() },
    onConnectionStateChanged: (s) => {
      connectionState.value = s
      // Refresh after reconnection to catch up on missed events
      if (s === 'connected') { void refreshMachine(); void refreshJob() }
    },
  })

  void (async () => {
    try { await hub.connect(); connectionState.value = hub.getConnectionState() }
    catch { connectionState.value = 'disconnected' }
    await refreshMachine()
    await refreshJob()
  })()

  // Fallback poll — slower when SignalR is active
  pollTimer = setInterval(() => { void refreshMachine(); void refreshJob() }, 10_000)
}

function teardown() {
  unsub?.()
  unsub = null
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ── Composable ──

export function useMachineState() {
  const connected = computed(() => connectionState.value === 'connected')

  onMounted(() => { if (++refCount === 1) init() })
  onUnmounted(() => { if (--refCount === 0) teardown() })

  return { machine, currentJob, session, connected, connectionState, refresh: refreshMachine, refreshJob }
}
