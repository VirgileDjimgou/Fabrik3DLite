<template>
  <div class="container-fluid py-2" data-testid="instructor-dashboard">
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
      <div>
        <h1 class="h5 mb-0">{{ t('instructor.title') }}</h1>
        <p class="small text-muted mb-0">{{ t('instructor.subtitle') }}</p>
      </div>
      <router-link to="/" class="btn btn-outline-secondary btn-sm" data-testid="instructor-back">
        <i class="bi bi-arrow-left me-1"></i>{{ t('instructor.back') }}
      </router-link>
    </header>

    <HmiErrorState
      v-if="offline"
      data-testid="instructor-offline"
      :title="t('instructor.offline')"
      :detail="t('instructor.offlineDetail')"
    />

    <template v-else>
      <InstructorClassSelector
        :classes="classes"
        :selected-id="selectedClassId"
        :loading="loading.classes"
        :error="errors.classes"
        @select="onClassSelect"
      />

      <!-- Filters apply to both the session list and the server-side aggregates -->
      <section class="card mb-3" aria-labelledby="instructor-filters-title">
        <div class="card-body">
          <h2 id="instructor-filters-title" class="h6 mb-2">{{ t('instructor.metricsFilters') }}</h2>
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-4">
              <label class="form-label" for="filter-scenario">{{ t('instructor.scenarioFilter') }}</label>
              <input
                id="filter-scenario"
                v-model="filterForm.scenarioId"
                class="form-control"
                list="instructor-scenario-options"
                data-testid="filter-scenario"
              >
              <datalist id="instructor-scenario-options">
                <option v-for="scenario in scenarioOptions" :key="scenario" :value="scenario" />
              </datalist>
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label" for="filter-from">{{ t('instructor.fromFilter') }}</label>
              <input id="filter-from" v-model="filterForm.fromUtc" type="datetime-local" class="form-control" data-testid="filter-from">
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label" for="filter-to">{{ t('instructor.toFilter') }}</label>
              <input id="filter-to" v-model="filterForm.toUtc" type="datetime-local" class="form-control" data-testid="filter-to">
            </div>
            <div class="col-12 col-md-2 d-flex gap-2">
              <button type="button" class="btn btn-hmi flex-grow-1" data-testid="filter-apply" @click="applyFilters">
                {{ t('instructor.applyFilters') }}
              </button>
              <button type="button" class="btn btn-outline-secondary" data-testid="filter-reset" @click="resetFilters">
                {{ t('instructor.resetFilters') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <InstructorMetricsPanel :metrics="metrics" :loading="loading.metrics" :error="errors.metrics" />

      <div class="row g-3">
        <div class="col-12 col-lg-5">
          <InstructorSessionList
            :sessions="sessions"
            :selected-id="selectedSessionId"
            :loading="loading.sessions"
            :error="errors.sessions"
            @select="onSessionSelect"
          />
          <InstructorAssignmentPanel
            :class-id="selectedClassId"
            :assignments="assignments"
            :scenario-options="scenarioOptions"
            :loading="loading.assignments"
            :error="errors.assignments"
            :pending="assignmentPending"
            :feedback="assignmentFeedback"
            @assign="onAssign"
            @unassign="onUnassign"
          />
        </div>
        <div class="col-12 col-lg-7">
          <InstructorSessionReview
            :session="reviewSession"
            :actions="actions"
            :assessment="assessment"
            :loading="loading.review"
            :error="errors.review"
            :restart-pending="restartPending"
            :restart-feedback="restartFeedback"
            @restart="onRestart"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  InstructorMetricsDto,
  TrainingActionDto,
  TrainingAssessmentDto,
  TrainingClassDto,
  TrainingResourceAssignmentDto,
  TrainingSessionDto,
} from '@fabrik3d/contracts'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import InstructorAssignmentPanel from '@/components/instructor/InstructorAssignmentPanel.vue'
import InstructorClassSelector from '@/components/instructor/InstructorClassSelector.vue'
import InstructorMetricsPanel from '@/components/instructor/InstructorMetricsPanel.vue'
import InstructorSessionList from '@/components/instructor/InstructorSessionList.vue'
import InstructorSessionReview from '@/components/instructor/InstructorSessionReview.vue'
import {
  assignResource,
  getClassResources,
  getClasses,
  getMetrics,
  getSession,
  getSessionActions,
  listSessions,
  restartSession,
  unassignResource,
  type SessionFilters,
} from '@/instructor/instructorApi'
import type { StatusTone } from '@/instructor/instructorView'

const { t } = useI18n()

const classes = ref<TrainingClassDto[]>([])
const assignments = ref<TrainingResourceAssignmentDto[]>([])
const sessions = ref<TrainingSessionDto[]>([])
const metrics = ref<InstructorMetricsDto | null>(null)
const reviewSession = ref<TrainingSessionDto | null>(null)
const actions = ref<TrainingActionDto[]>([])
const assessment = ref<TrainingAssessmentDto | null>(null)

const selectedClassId = ref('')
const selectedSessionId = ref('')

const loading = reactive({ classes: false, assignments: false, sessions: false, metrics: false, review: false })
const errors = reactive<{ classes: string | null; assignments: string | null; sessions: string | null; metrics: string | null; review: string | null }>({
  classes: null, assignments: null, sessions: null, metrics: null, review: null,
})
const offline = ref(false)

const assignmentPending = ref(false)
const assignmentFeedback = ref<{ tone: StatusTone; message: string } | null>(null)
const restartPending = ref(false)
const restartFeedback = ref<{ tone: StatusTone; message: string } | null>(null)

const filterForm = reactive({ scenarioId: '', fromUtc: '', toUtc: '' })
const applied = reactive<SessionFilters>({ scenarioId: '', fromUtc: '', toUtc: '' })

function describeError(error: unknown): { message: string; offline: boolean } {
  const candidate = error as { offline?: boolean; message?: string } | undefined
  return {
    message: candidate?.message ?? String(error),
    offline: candidate?.offline === true,
  }
}

function toIso(value: string): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

const scenarioOptions = ref<string[]>([])

function refreshScenarioOptions(): void {
  const values = new Set<string>()
  for (const session of sessions.value) values.add(session.scenarioId)
  for (const assignment of assignments.value) {
    if (assignment.kind === 'Scenario') values.add(assignment.resourceId)
  }
  scenarioOptions.value = [...values].filter((value) => value.length > 0).sort()
}

async function loadClasses(): Promise<void> {
  loading.classes = true
  errors.classes = null
  try {
    classes.value = await getClasses()
  } catch (error) {
    const detail = describeError(error)
    offline.value = detail.offline
    errors.classes = detail.message
  } finally {
    loading.classes = false
  }
}

async function loadSessions(): Promise<void> {
  loading.sessions = true
  errors.sessions = null
  try {
    sessions.value = await listSessions({
      classId: selectedClassId.value || undefined,
      scenarioId: applied.scenarioId || undefined,
      fromUtc: applied.fromUtc,
      toUtc: applied.toUtc,
    })
    // Keep the current selection when it is still visible; otherwise select the first session so the
    // review panel is never left empty when evidence is available.
    if (!sessions.value.some((s) => s.id === selectedSessionId.value)) {
      selectedSessionId.value = sessions.value[0]?.id ?? ''
    }
    refreshScenarioOptions()
  } catch (error) {
    const detail = describeError(error)
    offline.value = detail.offline
    errors.sessions = detail.message
  } finally {
    loading.sessions = false
  }
}

async function loadMetrics(): Promise<void> {
  loading.metrics = true
  errors.metrics = null
  try {
    metrics.value = await getMetrics({
      classId: selectedClassId.value || undefined,
      scenarioId: applied.scenarioId || undefined,
      fromUtc: applied.fromUtc,
      toUtc: applied.toUtc,
    })
  } catch (error) {
    const detail = describeError(error)
    offline.value = detail.offline
    errors.metrics = detail.message
  } finally {
    loading.metrics = false
  }
}

async function loadAssignments(): Promise<void> {
  loading.assignments = true
  errors.assignments = null
  try {
    assignments.value = await getClassResources(selectedClassId.value || undefined)
    refreshScenarioOptions()
  } catch (error) {
    const detail = describeError(error)
    offline.value = detail.offline
    errors.assignments = detail.message
  } finally {
    loading.assignments = false
  }
}

async function loadReview(): Promise<void> {
  if (!selectedSessionId.value) {
    reviewSession.value = null
    actions.value = []
    assessment.value = null
    return
  }
  loading.review = true
  errors.review = null
  restartFeedback.value = null
  try {
    const session = await getSession(selectedSessionId.value)
    reviewSession.value = session
    // The server DTO constructor always populates every assessment field; the generated schema marks
    // them optional, so this narrows the nested type without inventing any value.
    assessment.value = (session.assessment ?? null) as TrainingAssessmentDto | null
    actions.value = await getSessionActions(selectedSessionId.value)
  } catch (error) {
    const detail = describeError(error)
    offline.value = detail.offline
    errors.review = detail.message
  } finally {
    loading.review = false
  }
}

function onClassSelect(id: string): void {
  selectedClassId.value = id
  selectedSessionId.value = ''
}

function onSessionSelect(id: string): void {
  selectedSessionId.value = id
}

function applyFilters(): void {
  applied.scenarioId = filterForm.scenarioId.trim()
  applied.fromUtc = toIso(filterForm.fromUtc)
  applied.toUtc = toIso(filterForm.toUtc)
  void loadSessions()
  void loadMetrics()
}

function resetFilters(): void {
  filterForm.scenarioId = ''
  filterForm.fromUtc = ''
  filterForm.toUtc = ''
  applied.scenarioId = ''
  applied.fromUtc = undefined
  applied.toUtc = undefined
  void loadSessions()
  void loadMetrics()
}

async function onAssign(payload: { kind: string; resourceId: string }): Promise<void> {
  if (!selectedClassId.value) {
    assignmentFeedback.value = { tone: 'warning', message: t('instructor.selectClassFirst') }
    return
  }
  assignmentPending.value = true
  assignmentFeedback.value = null
  try {
    await assignResource({ kind: payload.kind, resourceId: payload.resourceId, classId: selectedClassId.value })
    assignmentFeedback.value = { tone: 'success', message: t('instructor.assignmentSuccess') }
    await loadAssignments()
  } catch (error) {
    const detail = describeError(error)
    assignmentFeedback.value = {
      tone: 'fault',
      message: detail.offline ? t('instructor.offline') : t('instructor.assignmentFailed'),
    }
  } finally {
    assignmentPending.value = false
  }
}

async function onUnassign(id: string): Promise<void> {
  assignmentPending.value = true
  assignmentFeedback.value = null
  try {
    await unassignResource(id)
    assignmentFeedback.value = { tone: 'success', message: t('instructor.assignmentSuccess') }
    await loadAssignments()
  } catch (error) {
    const detail = describeError(error)
    assignmentFeedback.value = {
      tone: 'fault',
      message: detail.offline ? t('instructor.offline') : t('instructor.assignmentFailed'),
    }
  } finally {
    assignmentPending.value = false
  }
}

async function onRestart(reason: string): Promise<void> {
  if (!selectedSessionId.value) return
  restartPending.value = true
  restartFeedback.value = null
  try {
    const result = await restartSession(selectedSessionId.value, { reason: reason || undefined })
    restartFeedback.value = { tone: 'success', message: t('instructor.restartSuccess') }
    await loadSessions()
    await loadMetrics()
    selectedSessionId.value = result.session.id
  } catch (error) {
    const detail = describeError(error)
    restartFeedback.value = {
      tone: 'fault',
      message: detail.offline ? t('instructor.offline') : t('instructor.restartFailed'),
    }
  } finally {
    restartPending.value = false
  }
}

watch(selectedClassId, () => {
  void loadSessions()
  void loadMetrics()
  void loadAssignments()
})

watch(selectedSessionId, () => {
  void loadReview()
})

onMounted(async () => {
  await loadClasses()
  await Promise.all([loadSessions(), loadMetrics(), loadAssignments()])
})
</script>
