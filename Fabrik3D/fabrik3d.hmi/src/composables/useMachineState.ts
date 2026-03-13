import { ref, onMounted, onUnmounted } from 'vue'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { MachineStateDto, JobDto, SimulationSessionDto } from '@/services/api'

export function useMachineState() {
  const machine = ref<MachineStateDto | null>(null)
  const currentJob = ref<JobDto | null>(null)
  const session = ref<SimulationSessionDto | null>(null)
  const connected = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function refresh() {
    try { const m = await api.getCurrentMachineState(); if (m) machine.value = m; connected.value = true }
    catch { connected.value = false }
  }

  async function refreshJob() {
    try {
      const jobs = await api.getJobs()
      const active = jobs.find(j => j.status === 'Running' || j.status === 'Paused')
      currentJob.value = active ?? null
      if (active?.simulationSessionId) {
        try { session.value = await api.getSessionById(active.simulationSessionId) } catch { session.value = null }
      } else { session.value = null }
    } catch { /* offline */ }
  }

  onMounted(async () => {
    hub.on({
      onMachineStateChanged: () => { void refresh() },
      onJobStateChanged: () => { void refreshJob() },
      onSimulationStateChanged: () => { void refresh(); void refreshJob() },
    })
    try { await hub.connect(); connected.value = hub.isConnected() }
    catch { connected.value = false }
    await refresh(); await refreshJob()
    pollTimer = setInterval(() => { void refresh(); void refreshJob() }, 5000)
  })

  onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

  return { machine, currentJob, session, connected, refresh, refreshJob }
}
