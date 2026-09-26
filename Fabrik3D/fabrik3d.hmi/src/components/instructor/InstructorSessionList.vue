<template>
  <section class="card mb-3" aria-labelledby="instructor-sessions-title">
    <div class="card-body">
      <h2 id="instructor-sessions-title" class="h6 mb-2">{{ t('instructor.sessions') }}</h2>

      <div v-if="loading" class="hmi-status hmi-status--loading" role="status" data-testid="sessions-loading">
        <i class="bi bi-arrow-repeat"></i><span>{{ t('instructor.loading') }}</span>
      </div>

      <HmiErrorState
        v-else-if="error"
        data-testid="sessions-error"
        :title="t('instructor.errorTitle')"
        :detail="error"
      />

      <HmiEmptyState
        v-else-if="sessions.length === 0"
        data-testid="sessions-empty"
        :title="t('instructor.noSessions')"
        :detail="t('instructor.noSessionsDetail')"
      />

      <div v-else class="table-responsive">
        <table class="table table-sm align-middle mb-0" data-testid="sessions-table">
          <thead>
            <tr>
              <th scope="col">{{ t('instructor.learner') }}</th>
              <th scope="col">{{ t('instructor.scenario') }}</th>
              <th scope="col">{{ t('instructor.status') }}</th>
              <th scope="col">{{ t('instructor.elapsed') }}</th>
              <th scope="col" class="text-end">{{ t('instructor.score') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="session in sessions"
              :key="session.id"
              :class="{ 'table-active': session.id === selectedId }"
              :data-testid="`session-row-${session.id}`"
              tabindex="0"
              role="button"
              :aria-pressed="session.id === selectedId"
              @click="emit('select', session.id)"
              @keydown.enter.prevent="emit('select', session.id)"
              @keydown.space.prevent="emit('select', session.id)"
            >
              <td>{{ session.alias || session.learnerSubject }}</td>
              <td>{{ session.scenarioId }}</td>
              <td>
                <span class="hmi-status" :class="`hmi-status--${sessionStatusTone(session.status)}`">
                  {{ session.status }}
                </span>
              </td>
              <td>{{ formatDuration(elapsedSeconds(session.startedAtUtc, session.endedAtUtc, now)) }}</td>
              <td class="text-end">
                <span v-if="session.assessmentStatus === 'Computed'">{{ session.score }}/{{ session.possibleScore }}</span>
                <span v-else class="text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TrainingSessionDto } from '@fabrik3d/contracts'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import { elapsedSeconds, formatDuration, sessionStatusTone } from '@/instructor/instructorView'

withDefaults(defineProps<{
  sessions: TrainingSessionDto[]
  selectedId: string
  loading: boolean
  error: string | null
  now?: number
}>(), { now: () => Date.now() })

const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()
</script>
