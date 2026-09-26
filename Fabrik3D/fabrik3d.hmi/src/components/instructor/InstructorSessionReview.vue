<template>
  <section class="card mb-3" aria-labelledby="instructor-review-title">
    <div class="card-body">
      <h2 id="instructor-review-title" class="h6 mb-2">{{ t('instructor.review') }}</h2>

      <div v-if="loading" class="hmi-status hmi-status--loading" role="status" data-testid="review-loading">
        <i class="bi bi-arrow-repeat"></i><span>{{ t('instructor.loading') }}</span>
      </div>

      <HmiErrorState
        v-else-if="error"
        data-testid="review-error"
        :title="t('instructor.errorTitle')"
        :detail="error"
      />

      <HmiEmptyState
        v-else-if="!session"
        data-testid="review-empty"
        :title="t('instructor.noSessionSelected')"
        :detail="t('instructor.noSessionSelectedDetail')"
      />

      <template v-else>
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
          <div>
            <div class="fw-semibold" data-testid="review-learner">
              {{ session.alias || session.learnerSubject }}
            </div>
            <div class="text-muted small">
              {{ session.scenarioId }} · {{ t('instructor.started') }} {{ formatDateTime(session.startedAtUtc) }}
            </div>
          </div>
          <div class="text-end">
            <span class="hmi-status" :class="`hmi-status--${sessionStatusTone(session.status)}`" data-testid="review-status">
              {{ session.status }}
            </span>
            <div class="small text-muted" data-testid="review-elapsed">
              {{ t('instructor.elapsed') }}: {{ formatDuration(elapsedSeconds(session.startedAtUtc, session.endedAtUtc, now)) }}
            </div>
          </div>
        </div>

        <!-- Expected vs observed -->
        <h3 class="h7 mt-3 mb-1">{{ t('instructor.expectedVsObserved') }}</h3>
        <p v-if="comparison.length === 0" class="text-muted small mb-2" data-testid="comparison-empty">
          {{ t('instructor.noExpected') }}
        </p>
        <div v-else class="table-responsive">
          <table class="table table-sm mb-2" data-testid="comparison-table">
            <thead>
              <tr>
                <th scope="col">{{ t('instructor.expected') }}</th>
                <th scope="col">{{ t('instructor.outcome') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in comparison" :key="entry.index">
                <td>{{ entry.expected }}</td>
                <td>
                  <span
                    class="hmi-status"
                    :class="`hmi-status--${entry.status === 'satisfied' ? 'success' : entry.status === 'incorrect' ? 'warning' : 'fault'}`"
                  >{{ t(`instructor.${entry.status}`) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-if="unexpected.length > 0">
          <h3 class="h7 mt-2 mb-1">{{ t('instructor.unexpected') }}</h3>
          <ul class="small mb-2" data-testid="unexpected-list">
            <li v-for="action in unexpected" :key="action.id">
              {{ action.type }}
              <span v-if="action.correctness === 'incorrect'" class="text-danger">({{ t('instructor.incorrect') }})</span>
              <span v-if="action.isFault" class="text-warning">({{ t('instructor.faults') }})</span>
              <span v-if="action.isRecovery" class="text-success">({{ t('instructor.recoveries') }})</span>
            </li>
          </ul>
        </template>

        <!-- Typed evidence counters -->
        <h3 class="h7 mt-3 mb-1">{{ t('instructor.evidence') }}</h3>
        <ul class="list-inline small mb-2" data-testid="evidence-counters">
          <li class="list-inline-item me-3">{{ t('instructor.hints') }}: <strong>{{ session.hintCount }}</strong></li>
          <li class="list-inline-item me-3">{{ t('instructor.faults') }}: <strong>{{ session.faultCount }}</strong></li>
          <li class="list-inline-item me-3">{{ t('instructor.recoveries') }}: <strong>{{ session.recoveryActionCount }}</strong></li>
          <li class="list-inline-item me-3">{{ t('instructor.safetyViolations') }}: <strong>{{ session.safetyViolationCount }}</strong></li>
        </ul>

        <!-- Timeline -->
        <h3 class="h7 mt-3 mb-1">{{ t('instructor.timeline') }}</h3>
        <p v-if="actions.length === 0" class="text-muted small mb-2" data-testid="timeline-empty">
          {{ t('instructor.noActions') }}
        </p>
        <ol v-else class="small mb-2 ps-3" data-testid="timeline-list">
          <li v-for="action in actions" :key="action.id">
            <span class="text-muted">#{{ action.sequence }}</span>
            {{ action.type }}
            <span v-if="action.target" class="text-muted">→ {{ action.target }}</span>
            <span v-if="action.isFault" class="badge text-bg-warning ms-1">{{ t('instructor.faults') }}</span>
            <span v-if="action.isHint" class="badge text-bg-secondary ms-1">{{ t('instructor.hints') }}</span>
            <span v-if="action.isRecovery" class="badge text-bg-success ms-1">{{ t('instructor.recoveries') }}</span>
            <span v-if="action.isSafetyViolation" class="badge text-bg-danger ms-1">{{ t('instructor.safetyViolations') }}</span>
          </li>
        </ol>

        <!-- Score evidence: rendered from the server assessment, never re-computed here -->
        <h3 class="h7 mt-3 mb-1">{{ t('instructor.scoreEvidence') }}</h3>
        <p v-if="!assessment" class="text-muted small mb-2" data-testid="assessment-pending">
          {{ t('instructor.assessmentPending') }}
        </p>
        <template v-else>
          <div class="mb-2" data-testid="score-summary">
            <strong>{{ assessment.effectiveScore }}/{{ assessment.effectivePossibleScore }}</strong>
            <span class="text-muted small ms-2">{{ assessment.status }}</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm mb-2" data-testid="criteria-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('instructor.criteria') }}</th>
                  <th scope="col" class="text-end">{{ t('instructor.awarded') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="criterion in assessment.criteria" :key="criterion.id">
                  <td>
                    <span class="fw-semibold">{{ criterion.label }}</span>
                    <div class="text-muted small">{{ criterion.explanation }}</div>
                  </td>
                  <td class="text-end">{{ criterion.earned }}/{{ criterion.points }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="small text-muted mb-2" data-testid="educational-disclaimer">{{ assessment.disclaimer }}</p>
        </template>

        <!-- Audited restart -->
        <hr>
        <template v-if="!isRestartable(session.status)">
          <p class="text-muted small mb-0" data-testid="restart-unavailable">{{ t('instructor.restartUnavailable') }}</p>
        </template>
        <template v-else>
          <label class="form-label" for="restart-reason">{{ t('instructor.restartReason') }}</label>
          <input
            id="restart-reason"
            v-model="reason"
            class="form-control mb-2"
            data-testid="restart-reason"
            :placeholder="t('instructor.restartReasonPlaceholder')"
          >
          <button
            type="button"
            class="btn btn-outline-danger"
            data-testid="restart-open"
            :disabled="restartPending"
            @click="dialogOpen = true"
          >
            <i class="bi bi-arrow-counterclockwise me-1"></i>{{ t('instructor.restart') }}
          </button>
        </template>

        <p
          v-if="restartPending"
          class="hmi-status hmi-status--pending mt-2 mb-0"
          role="status"
          data-testid="restart-pending"
        >
          {{ t('instructor.restartPending') }}
        </p>
        <p
          v-else-if="restartFeedback"
          class="hmi-status mt-2 mb-0"
          :class="`hmi-status--${restartFeedback.tone}`"
          role="status"
          data-testid="restart-feedback"
        >
          {{ restartFeedback.message }}
        </p>

        <HmiConfirmationDialog
          :open="dialogOpen"
          :title="t('instructor.restartTitle')"
          :message="t('instructor.restartMessage')"
          :target-label="t('instructor.restartTarget')"
          :target="`${session.alias || session.learnerSubject} · ${session.scenarioId}`"
          :confirm-label="t('instructor.restartConfirm')"
          :cancel-label="t('instructor.restartCancel')"
          @confirm="confirmRestart"
          @cancel="dialogOpen = false"
        />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrainingActionDto, TrainingAssessmentDto, TrainingSessionDto } from '@fabrik3d/contracts'
import HmiConfirmationDialog from '@/components/controls/HmiConfirmationDialog.vue'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import {
  compareExpectedVsObserved,
  elapsedSeconds,
  formatDateTime,
  formatDuration,
  isRestartable,
  sessionStatusTone,
  unexpectedObservedActions,
  type StatusTone,
} from '@/instructor/instructorView'

const props = withDefaults(defineProps<{
  session: TrainingSessionDto | null
  actions: TrainingActionDto[]
  assessment: TrainingAssessmentDto | null
  loading: boolean
  error: string | null
  restartPending: boolean
  restartFeedback: { tone: StatusTone; message: string } | null
  now?: number
}>(), { now: () => Date.now(), assessment: null, restartFeedback: null })

const emit = defineEmits<{ restart: [reason: string] }>()
const { t } = useI18n()

const dialogOpen = ref(false)
const reason = ref('')

const comparison = computed(() =>
  props.session ? compareExpectedVsObserved(props.session.expectedActions, props.actions) : [])
const unexpected = computed(() =>
  props.session ? unexpectedObservedActions(props.session.expectedActions, props.actions) : [])

// A new target never keeps a stale confirmation open.
watch(() => props.session?.id, () => {
  dialogOpen.value = false
  reason.value = ''
})

function confirmRestart(): void {
  dialogOpen.value = false
  emit('restart', reason.value.trim())
}
</script>
