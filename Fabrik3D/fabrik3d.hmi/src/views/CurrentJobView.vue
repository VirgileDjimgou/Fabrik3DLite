<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-clipboard-data hmi-icon me-2"></i>{{ t('currentJob.title') }}</h5>
    <div v-if="!job" class="alert alert-secondary">{{ t('currentJob.noActiveJob') }}</div>
    <template v-else>
      <!-- Job info -->
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">{{ job.name }}</h6>
          <p class="card-text text-muted mb-2">{{ job.description }}</p>
          <div class="row small">
            <div class="col-6"><strong>{{ t('jobs.status') }}:</strong>
              <span class="badge ms-1" :class="statusBadge(job.status)">{{ job.status }}</span>
            </div>
            <div class="col-6"><strong>{{ t('jobs.mode') }}:</strong> {{ job.machineMode }}</div>
            <div class="col-6 mt-1"><strong>{{ t('jobs.progressPercent') }}:</strong> {{ job.progressPercent }}%</div>
            <div class="col-6 mt-1"><strong>{{ t('currentJob.jobId') }}:</strong>
              <span class="font-monospace">{{ job.id.slice(-6) }}</span>
            </div>
            <div class="col-6 mt-1"><strong>{{ t('currentJob.session') }}:</strong>
              <span class="font-monospace">{{ job.simulationSessionId ? job.simulationSessionId.slice(-6) : '-' }}</span>
            </div>
          </div>
          <div class="progress mt-2" style="height: 6px">
            <div class="progress-bar" role="progressbar"
              :style="{ width: job.progressPercent + '%', backgroundColor: 'var(--hmi-icon-color)' }"></div>
          </div>
        </div>
      </div>

      <!-- Simulation session -->
      <div v-if="session" class="card mb-3">
        <div class="card-body">
          <h6 class="card-title"><i class="bi bi-activity hmi-icon me-1"></i>{{ t('currentJob.session') }}</h6>
          <div class="row small">
            <div class="col-6"><strong>{{ t('currentJob.sessionStatus') }}:</strong>
              <span class="badge ms-1" :class="sessionStatusBadge(session.status)">{{ session.status }}</span>
            </div>
            <div class="col-6"><strong>{{ t('currentJob.heartbeat') }}:</strong>
              {{ formatTime(session.lastHeartbeatUtc) }}
            </div>
            <div class="col-6 mt-1"><strong>{{ t('status.currentPhase') }}:</strong> {{ session.currentPhase }}</div>
            <div class="col-6 mt-1"><strong>{{ t('status.currentPallet') }}:</strong> {{ session.currentPalletId ?? '-' }}</div>
            <div class="col-4 mt-1"><strong>{{ t('status.machined') }}:</strong> {{ session.machinedCount }}</div>
            <div class="col-4 mt-1"><strong>{{ t('status.remaining') }}:</strong> {{ session.remainingCount }}</div>
            <div class="col-4 mt-1"><strong>{{ t('status.total') }}:</strong> {{ session.totalCount }}</div>
            <div v-if="session.currentTaskId" class="col-6 mt-1">
              <strong>{{ t('currentJob.taskId') }}:</strong>
              <span class="font-monospace">{{ session.currentTaskId.slice(-6) }}</span>
            </div>
            <div v-if="session.simulatorId" class="col-6 mt-1">
              <strong>{{ t('currentJob.simulator') }}:</strong>
              <span class="font-monospace">{{ session.simulatorId.slice(-6) }}</span>
            </div>
          </div>
          <div class="progress mt-2" style="height: 6px">
            <div class="progress-bar" role="progressbar"
              :style="{ width: sessionProgress + '%', backgroundColor: 'var(--hmi-icon-color)' }"></div>
          </div>
        </div>
      </div>

      <!-- Machine state -->
      <div v-if="machine" class="card mb-3">
        <div class="card-body">
          <h6 class="card-title"><i class="bi bi-gear-wide-connected hmi-icon me-1"></i>{{ t('currentJob.machineState') }}</h6>
          <div class="row small">
            <div class="col-6"><strong>{{ t('status.robotState') }}:</strong> {{ machine.robotState }}</div>
            <div class="col-6"><strong>{{ t('status.cncState') }}:</strong> {{ machine.cncState }}</div>
            <div class="col-6 mt-1"><strong>{{ t('status.currentPhase') }}:</strong> {{ machine.currentPhase }}</div>
            <div class="col-6 mt-1"><strong>{{ t('status.currentSlot') }}:</strong> R{{ machine.currentSlotRow }} C{{ machine.currentSlotColumn }}</div>
          </div>
        </div>
      </div>

      <!-- Command feedback -->
      <div v-if="commandError" class="alert alert-danger small py-1">{{ commandError }}</div>

      <!-- Control buttons -->
      <div class="d-flex gap-2 mb-3">
        <button class="btn btn-hmi btn-sm" @click="doStart" :disabled="busy || job.status === 'Running'">
          <i class="bi bi-play-fill me-1"></i>{{ t('tiles.start') }}</button>
        <button class="btn btn-warning btn-sm" @click="doPause" :disabled="busy || job.status !== 'Running'">
          <i class="bi bi-pause-fill me-1"></i>{{ t('currentJob.pause') }}</button>
        <button class="btn btn-success btn-sm" @click="doResume" :disabled="busy || job.status !== 'Paused'">
          <i class="bi bi-arrow-repeat me-1"></i>{{ t('tiles.resume') }}</button>
        <button class="btn btn-danger btn-sm" @click="doStop"
          :disabled="busy || job.status === 'Stopped' || job.status === 'Completed'">
          <i class="bi bi-stop-fill me-1"></i>{{ t('currentJob.stop') }}</button>
      </div>

      <!-- Tasks -->
      <h6>{{ t('currentJob.tasks') }}</h6>
      <div v-if="tasks.length === 0" class="text-muted small">{{ t('currentJob.noTasks') }}</div>
      <div class="table-responsive" v-else>
        <table class="table table-sm table-striped align-middle">
          <thead><tr>
            <th>#</th><th>{{ t('jobs.name') }}</th><th>{{ t('jobs.status') }}</th>
            <th>{{ t('currentJob.part') }}</th><th>{{ t('currentJob.pallet') }}</th><th>{{ t('currentJob.slot') }}</th>
            <th>{{ t('currentJob.taskId') }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="tk in tasks" :key="tk.id">
              <td>{{ tk.sequenceOrder }}</td><td>{{ tk.name }}</td>
              <td><span class="badge" :class="statusBadge(tk.status)">{{ tk.status }}</span></td>
              <td>{{ tk.partType }}</td>
              <td><span class="font-monospace">{{ tk.palletId ?? '-' }}</span></td>
              <td>R{{ tk.slotRow }} C{{ tk.slotColumn }}</td>
              <td><span class="font-monospace">{{ tk.id.slice(-6) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { JobDto, TaskDto } from '@/services/api'
import { useMachineState } from '@/composables/useMachineState'

const { t } = useI18n()
const { machine, session } = useMachineState()
const job = ref<JobDto | null>(null)
const tasks = ref<TaskDto[]>([])
const busy = ref(false)
const commandError = ref('')

function statusBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Paused' ? 'bg-warning text-dark'
    : s === 'Stopped' ? 'bg-danger' : s === 'Completed' ? 'bg-info'
    : s === 'Faulted' ? 'bg-danger' : 'bg-secondary'
}

function sessionStatusBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Paused' ? 'bg-warning text-dark'
    : s === 'Faulted' ? 'bg-danger' : 'bg-secondary'
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString()
}

const sessionProgress = computed(() => {
  const s = session.value
  if (!s || s.totalCount === 0) return 0
  return Math.round((s.machinedCount / s.totalCount) * 100)
})

async function loadJob() {
  try {
    const jobs = await api.getJobs()
    const active = jobs.find(j => j.status === 'Running' || j.status === 'Paused') ?? jobs[0] ?? null
    job.value = active
    if (active) {
      try { tasks.value = await api.getJobTasks(active.id) } catch { tasks.value = [] }
    } else { tasks.value = [] }
  } catch { /* offline */ }
}

async function loadTasksOnly() {
  if (!job.value) return
  try { tasks.value = await api.getJobTasks(job.value.id) } catch { /* offline */ }
}

async function runCommand(action: () => Promise<unknown>) {
  if (!job.value || busy.value) return
  busy.value = true
  commandError.value = ''
  try {
    await action()
    await loadJob()
  } catch (e) {
    commandError.value = e instanceof Error ? e.message : t('currentJob.commandFailed')
  } finally {
    busy.value = false
  }
}

function doStart() { void runCommand(() => api.startJob(job.value!.id)) }
function doPause() { void runCommand(() => api.pauseJob(job.value!.id)) }
function doResume() { void runCommand(() => api.resumeJob(job.value!.id)) }
function doStop() { void runCommand(() => api.stopJob(job.value!.id)) }

let unsub: (() => void) | null = null
onMounted(() => {
  void loadJob()
  unsub = hub.subscribe({
    onJobStateChanged: () => { void loadJob() },
    onSimulationStateChanged: () => { void loadJob() },
    onTaskStateChanged: () => { void loadTasksOnly() },
  })
})
onUnmounted(() => { unsub?.() })
</script>
