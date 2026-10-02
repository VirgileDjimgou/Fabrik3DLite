<template>
  <div>
    <HmiConfirmationDialog :open="pendingAction !== null" :title="t('currentJob.confirmCommand')" :message="t('currentJob.commandMessage')" :target-label="t('currentJob.commandTarget')" :target="job?.name ?? '-'" :confirm-label="pendingAction ?? ''" :cancel-label="t('currentJob.cancel')" @confirm="confirmCommand" @cancel="pendingAction = null" />
    <h5 class="hmi-page-title mb-3"><i class="bi bi-clipboard-data hmi-icon me-2"></i>{{ t('currentJob.title') }}</h5>
    <HmiEmptyState v-if="!job" :title="t('currentJob.noActiveJob')" :detail="t('currentJob.selectFromList')"><router-link to="/jobs" class="btn btn-hmi">{{ t('tiles.jobList') }}</router-link></HmiEmptyState>
    <template v-else>
      <!-- Primary hierarchy: progress, current task, pallet, scenario, cell/simulator, dispatch, elapsed. -->
      <section class="hmi-status-strip mb-3" :class="jobStripClass" data-testid="current-job-status-strip">
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('jobs.progressPercent') }}</span>
          <span class="hmi-value hmi-value--primary" data-testid="current-job-progress">{{ job.progressPercent }}%</span>
        </div>
        <div class="hmi-metric flex-grow-1">
          <span class="hmi-label">{{ t('currentJob.currentTask') }}</span>
          <span class="hmi-value hmi-truncate" data-testid="current-job-task">{{ currentTaskLabel }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('status.currentPallet') }}</span>
          <span class="hmi-value" data-testid="current-job-pallet">{{ session?.currentPalletId ?? '-' }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('currentJob.scenario') }}</span>
          <span class="hmi-value hmi-truncate" data-testid="current-job-scenario">{{ session?.scenarioId ?? '-' }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('currentJob.elapsed') }}</span>
          <span class="hmi-value" data-testid="current-job-elapsed">{{ elapsed }}</span>
        </div>
      </section>

      <!-- Job identity and dispatch state -->
      <div class="hmi-card mb-3">
        <div class="hmi-card__body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="min-w-0">
              <h6 class="hmi-section-title hmi-truncate" data-testid="current-job-name">{{ job.name }}</h6>
              <p class="hmi-detail mb-0 hmi-truncate">{{ job.description }}</p>
            </div>
            <span class="badge" :class="statusBadge(job.status)" data-testid="current-job-status">{{ job.status }}</span>
          </div>
          <div class="row small mt-3">
            <div class="col-6 col-md-4 mt-1"><strong>{{ t('jobs.mode') }}:</strong> {{ job.machineMode }}</div>
            <div class="col-6 col-md-4 mt-1"><strong>{{ t('currentJob.jobId') }}:</strong>
              <span class="hmi-mono">{{ job.id.slice(-6) }}</span>
            </div>
            <div class="col-6 col-md-4 mt-1"><strong>{{ t('currentJob.session') }}:</strong>
              <span class="hmi-mono">{{ job.simulationSessionId ? job.simulationSessionId.slice(-6) : '-' }}</span>
            </div>
            <div v-if="job.dispatchState && job.dispatchState !== 'None'" class="col-6 col-md-4 mt-1">
              <strong>{{ t('currentJob.dispatch') }}:</strong>
              <span class="badge ms-1" :class="dispatchBadge(job.dispatchState)" data-dispatch-state>{{ job.dispatchState }}</span>
            </div>
            <div v-if="job.targetCellId" class="col-6 col-md-4 mt-1">
              <strong>{{ t('currentJob.targetCell') }}:</strong>
              <span class="hmi-mono hmi-truncate">{{ job.targetCellId }}</span>
            </div>
            <div v-if="job.assignedSimulatorId" class="col-6 col-md-4 mt-1">
              <strong>{{ t('currentJob.assignedSimulator') }}:</strong>
              <span class="hmi-mono">{{ job.assignedSimulatorId.slice(-6) }}</span>
            </div>
            <div v-if="job.dispatchFailureReason" class="col-12 mt-1 text-danger">
              <strong>{{ t('currentJob.dispatchFailure') }}:</strong> {{ job.dispatchFailureReason }}
            </div>
          </div>
          <div class="progress mt-3" style="height: 8px">
            <div class="progress-bar" role="progressbar"
              :style="{ width: job.progressPercent + '%', backgroundColor: 'var(--hmi-icon-color)' }"></div>
          </div>
        </div>
      </div>

      <!-- Simulation session timeline -->
      <div v-if="session" class="hmi-card mb-3">
        <div class="hmi-card__header">
          <span><i class="bi bi-activity hmi-icon me-1"></i>{{ t('currentJob.session') }}</span>
          <span class="badge" :class="sessionStatusBadge(session.status)">{{ session.status }}</span>
        </div>
        <div class="hmi-card__body">
          <div class="row small">
            <div class="col-6 col-md-3 mt-1"><strong>{{ t('status.currentPhase') }}:</strong> {{ session.currentPhase }}</div>
            <div class="col-6 col-md-3 mt-1"><strong>{{ t('currentJob.heartbeat') }}:</strong> {{ formatTime(session.lastHeartbeatUtc) }}</div>
            <div class="col-4 col-md-2 mt-1"><strong>{{ t('status.machined') }}:</strong> {{ session.machinedCount }}</div>
            <div class="col-4 col-md-2 mt-1"><strong>{{ t('status.remaining') }}:</strong> {{ session.remainingCount }}</div>
            <div class="col-4 col-md-2 mt-1"><strong>{{ t('status.total') }}:</strong> {{ session.totalCount }}</div>
            <div v-if="session.currentTaskId" class="col-6 col-md-3 mt-1">
              <strong>{{ t('currentJob.taskId') }}:</strong>
              <span class="hmi-mono">{{ session.currentTaskId.slice(-6) }}</span>
            </div>
            <div v-if="session.simulatorId" class="col-6 col-md-3 mt-1">
              <strong>{{ t('currentJob.simulator') }}:</strong>
              <span class="hmi-mono">{{ session.simulatorId.slice(-6) }}</span>
            </div>
          </div>
          <div class="progress mt-3" style="height: 8px">
            <div class="progress-bar" role="progressbar"
              :style="{ width: sessionProgress + '%', backgroundColor: 'var(--hmi-icon-color)' }"></div>
          </div>
        </div>
      </div>

      <!-- Machine state -->
      <div v-if="machine" class="hmi-card mb-3">
        <div class="hmi-card__header"><span><i class="bi bi-gear-wide-connected hmi-icon me-1"></i>{{ t('currentJob.machineState') }}</span></div>
        <div class="hmi-card__body">
          <div class="row small">
            <div class="col-6 col-md-3"><strong>{{ t('status.robotState') }}:</strong> {{ machine.robotState }}</div>
            <div class="col-6 col-md-3"><strong>{{ t('status.cncState') }}:</strong> {{ machine.cncState }}</div>
            <div class="col-6 col-md-3 mt-1"><strong>{{ t('status.currentPhase') }}:</strong> {{ machine.currentPhase }}</div>
            <div class="col-6 col-md-3 mt-1"><strong>{{ t('status.currentSlot') }}:</strong> R{{ machine.currentSlotRow }} C{{ machine.currentSlotColumn }}</div>
          </div>
        </div>
      </div>

      <!-- Command feedback -->
      <HmiErrorState v-if="commandError" :title="t('currentJob.commandFailed')" :detail="commandError" />

      <!-- Control buttons -->
      <div class="d-flex flex-wrap gap-2 mb-3" data-testid="current-job-actions">
        <button class="btn btn-hmi" @click="requestCommand('start')" :disabled="busy || job.status === 'Running'">
          <i class="bi bi-play-fill me-1"></i>{{ t('tiles.start') }}</button>
        <button class="btn btn-warning" @click="requestCommand('pause')" :disabled="busy || job.status !== 'Running'">
          <i class="bi bi-pause-fill me-1"></i>{{ t('currentJob.pause') }}</button>
        <button class="btn btn-success" @click="requestCommand('resume')" :disabled="busy || job.status !== 'Paused'">
          <i class="bi bi-arrow-repeat me-1"></i>{{ t('tiles.resume') }}</button>
        <button class="btn btn-danger" @click="requestCommand('stop')"
          :disabled="busy || job.status === 'Stopped' || job.status === 'Completed'">
          <i class="bi bi-stop-fill me-1"></i>{{ t('currentJob.stop') }}</button>
      </div>

      <!-- Tasks -->
      <h6 class="hmi-section-title mb-2">{{ t('currentJob.tasks') }}</h6>
      <div v-if="tasks.length === 0" class="hmi-detail">{{ t('currentJob.noTasks') }}</div>
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
              <td><span class="hmi-mono">{{ tk.palletId ?? '-' }}</span></td>
              <td>R{{ tk.slotRow }} C{{ tk.slotColumn }}</td>
              <td><span class="hmi-mono">{{ tk.id.slice(-6) }}</span></td>
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
import { useRoute } from 'vue-router'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { JobDto, TaskDto } from '@/services/api'
import { useMachineState } from '@/composables/useMachineState'
import HmiConfirmationDialog from '@/components/controls/HmiConfirmationDialog.vue'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'

const { t } = useI18n()
const route = useRoute()
const { machine, session } = useMachineState()
const job = ref<JobDto | null>(null)
const tasks = ref<TaskDto[]>([])
const busy = ref(false)
const commandError = ref('')
const pendingAction = ref<'start' | 'pause' | 'resume' | 'stop' | null>(null)

function statusBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Paused' ? 'bg-warning text-dark'
    : s === 'Stopped' ? 'bg-danger' : s === 'Completed' ? 'bg-info'
    : s === 'Faulted' ? 'bg-danger' : 'bg-secondary'
}

function sessionStatusBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Paused' ? 'bg-warning text-dark'
    : s === 'Faulted' ? 'bg-danger' : 'bg-secondary'
}

function dispatchBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Acknowledged' ? 'bg-info'
    : s === 'Pending' ? 'bg-warning text-dark'
    : s === 'Failed' || s === 'TimedOut' ? 'bg-danger' : 'bg-secondary'
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

const currentTaskLabel = computed(() => {
  const s = session.value
  if (!s) return t('currentJob.noTasks')
  const task = tasks.value.find(tk => tk.id === s.currentTaskId)
  return task?.name ?? s.currentPhase ?? t('currentJob.noTasks')
})

const jobStripClass = computed(() => {
  const status = job.value?.status
  if (status === 'Running') return 'hmi-status-strip--success'
  if (status === 'Paused') return 'hmi-status-strip--warning'
  if (status === 'Faulted' || status === 'Stopped') return 'hmi-status-strip--fault'
  return ''
})

const elapsed = computed(() => {
  const s = session.value
  if (!s?.startedAtUtc) return '-'
  const start = new Date(s.startedAtUtc).getTime()
  const end = s.endedAtUtc ? new Date(s.endedAtUtc).getTime() : Date.now()
  if (isNaN(start) || isNaN(end) || end < start) return '-'
  const totalSeconds = Math.round((end - start) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

async function loadJob() {
  try {
    // A composer submission can deep-link to the created job with ?job=<id> (S52).
    const requestedId = typeof route.query.job === 'string' ? route.query.job : ''
    if (requestedId) {
      const requested = await api.getJobById(requestedId)
      job.value = requested
      try { tasks.value = await api.getJobTasks(requested.id) } catch { tasks.value = [] }
      return
    }
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

function requestCommand(action: 'start' | 'pause' | 'resume' | 'stop') { pendingAction.value = action }
function confirmCommand() {
  const action = pendingAction.value
  pendingAction.value = null
  if (!action) return
  // Start goes through the server-authoritative dispatch path (S51): the server assigns one
  // compatible target and the simulator starts automatically. Pause/resume/stop stay coherent
  // with the assigned target through the same ownership model.
  const commands = {
    start: () => api.dispatchJob(job.value!.id),
    pause: () => api.pauseJob(job.value!.id),
    resume: () => api.resumeJob(job.value!.id),
    stop: () => api.stopJob(job.value!.id),
  }
  void runCommand(commands[action])
}

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
