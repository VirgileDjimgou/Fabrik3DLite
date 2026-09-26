<template>
  <section class="card mb-3" aria-labelledby="instructor-assignments-title">
    <div class="card-body">
      <h2 id="instructor-assignments-title" class="h6 mb-2">{{ t('instructor.assignments') }}</h2>

      <div v-if="loading" class="hmi-status hmi-status--loading" role="status" data-testid="assignments-loading">
        <i class="bi bi-arrow-repeat"></i><span>{{ t('instructor.loading') }}</span>
      </div>

      <HmiErrorState
        v-else-if="error"
        data-testid="assignments-error"
        :title="t('instructor.errorTitle')"
        :detail="error"
      />

      <HmiEmptyState
        v-else-if="assignments.length === 0"
        data-testid="assignments-empty"
        :title="t('instructor.noAssignments')"
        :detail="t('instructor.noAssignmentsDetail')"
      />

      <ul v-else class="list-group list-group-flush mb-3" data-testid="assignments-list">
        <li
          v-for="assignment in assignments"
          :key="assignment.id"
          class="list-group-item d-flex justify-content-between align-items-center px-0"
        >
          <span>
            <span class="badge text-bg-secondary me-2">{{ assignment.kind }}</span>
            <span>{{ assignment.resourceId }}</span>
          </span>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :data-testid="`unassign-${assignment.id}`"
            :disabled="pending"
            @click="emit('unassign', assignment.id)"
          >
            {{ t('instructor.unassign') }}
          </button>
        </li>
      </ul>

      <form class="row g-2 align-items-end" @submit.prevent="submit">
        <div class="col-12 col-md-4">
          <label class="form-label" for="assignment-kind">{{ t('instructor.resourceKind') }}</label>
          <select id="assignment-kind" v-model="kind" class="form-select" data-testid="assignment-kind">
            <option value="Scenario">{{ t('instructor.kindScenario') }}</option>
            <option value="CellTemplate">{{ t('instructor.kindCellTemplate') }}</option>
            <option value="TemplateFile">{{ t('instructor.kindTemplateFile') }}</option>
          </select>
        </div>
        <div class="col-12 col-md-5">
          <label class="form-label" for="assignment-resource">{{ t('instructor.resourceId') }}</label>
          <input
            id="assignment-resource"
            v-model="resourceId"
            class="form-control"
            list="instructor-scenario-options"
            data-testid="assignment-resource"
            :placeholder="t('instructor.resourcePlaceholder')"
          >
          <datalist id="instructor-scenario-options">
            <option v-for="scenario in scenarioOptions" :key="scenario" :value="scenario" />
          </datalist>
        </div>
        <div class="col-12 col-md-3">
          <button
            type="submit"
            class="btn btn-hmi w-100"
            data-testid="assign-submit"
            :disabled="pending || !resourceId"
          >
            {{ pending ? t('instructor.assigning') : t('instructor.assign') }}
          </button>
        </div>
      </form>

      <p
        v-if="feedback"
        class="hmi-status mt-2 mb-0"
        :class="`hmi-status--${feedback.tone}`"
        role="status"
        data-testid="assignment-feedback"
      >
        {{ feedback.message }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrainingResourceAssignmentDto } from '@fabrik3d/contracts'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import type { StatusTone } from '@/instructor/instructorView'

defineProps<{
  classId: string
  assignments: TrainingResourceAssignmentDto[]
  scenarioOptions: string[]
  loading: boolean
  error: string | null
  pending: boolean
  feedback: { tone: StatusTone; message: string } | null
}>()

const emit = defineEmits<{
  assign: [payload: { kind: string; resourceId: string }]
  unassign: [id: string]
}>()

const { t } = useI18n()
const kind = ref('Scenario')
const resourceId = ref('')

function submit(): void {
  if (!resourceId.value) return
  emit('assign', { kind: kind.value, resourceId: resourceId.value.trim() })
}
</script>
