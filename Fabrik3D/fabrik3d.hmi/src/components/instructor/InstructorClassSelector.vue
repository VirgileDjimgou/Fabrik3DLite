<template>
  <section class="card mb-3" aria-labelledby="instructor-classes-title">
    <div class="card-body">
      <h2 id="instructor-classes-title" class="h6 mb-2">{{ t('instructor.classes') }}</h2>

      <div v-if="loading" class="hmi-status hmi-status--loading" role="status" data-testid="class-loading">
        <i class="bi bi-arrow-repeat"></i><span>{{ t('instructor.loading') }}</span>
      </div>

      <HmiErrorState
        v-else-if="error"
        data-testid="class-error"
        :title="t('instructor.errorTitle')"
        :detail="error"
      />

      <HmiEmptyState
        v-else-if="classes.length === 0"
        data-testid="class-empty"
        :title="t('instructor.noClasses')"
        :detail="t('instructor.noClassesDetail')"
      />

      <template v-else>
        <label class="form-label" for="instructor-class-select">{{ t('instructor.selectClass') }}</label>
        <select
          id="instructor-class-select"
          class="form-select"
          data-testid="class-select"
          :value="selectedId"
          @change="onSelect"
        >
          <option value="">{{ t('instructor.allClasses') }}</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>

        <dl v-if="selected" class="row small mt-3 mb-0" data-testid="class-detail">
          <div class="col-6">
            <dt class="text-muted mb-0">{{ t('instructor.learners') }}</dt>
            <dd class="mb-0" data-testid="class-learner-count">{{ selected.learnerSubjects.length }}</dd>
          </div>
          <div class="col-6">
            <dt class="text-muted mb-0">{{ t('instructor.instructors') }}</dt>
            <dd class="mb-0">{{ selected.instructorSubjects.length }}</dd>
          </div>
          <div v-if="selected.description" class="col-12 mt-2">
            <dd class="mb-0 text-muted">{{ selected.description }}</dd>
          </div>
        </dl>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrainingClassDto } from '@fabrik3d/contracts'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'

const props = defineProps<{
  classes: TrainingClassDto[]
  selectedId: string
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()

const selected = computed(() => props.classes.find((item) => item.id === props.selectedId) ?? null)

function onSelect(event: Event): void {
  emit('select', (event.target as HTMLSelectElement).value)
}
</script>
