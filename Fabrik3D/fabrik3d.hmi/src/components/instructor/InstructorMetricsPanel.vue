<template>
  <section class="card mb-3" aria-labelledby="instructor-metrics-title">
    <div class="card-body">
      <h2 id="instructor-metrics-title" class="h6 mb-1">{{ t('instructor.metrics') }}</h2>
      <p class="small text-muted mb-2">{{ t('instructor.metricsDefinitions') }}</p>

      <div v-if="loading" class="hmi-status hmi-status--loading" role="status" data-testid="metrics-loading">
        <i class="bi bi-arrow-repeat"></i><span>{{ t('instructor.loading') }}</span>
      </div>

      <HmiErrorState
        v-else-if="error"
        data-testid="metrics-error"
        :title="t('instructor.errorTitle')"
        :detail="error"
      />

      <HmiEmptyState
        v-else-if="!metrics || metrics.sessionCount === 0"
        data-testid="metrics-empty"
        :title="t('instructor.noMetrics')"
        :detail="t('instructor.noMetricsDetail')"
      />

      <template v-else>
        <div class="row g-2" data-testid="metrics-cards">
          <div v-for="card in cards" :key="card.key" class="col-6 col-lg-4">
            <div class="border rounded p-2 h-100" :data-testid="`metric-${card.key}`">
              <div class="small text-muted">{{ t(`instructor.${card.key}`) }}</div>
              <div class="h5 mb-0 hmi-status" :class="`hmi-status--${card.tone}`">{{ card.value }}</div>
            </div>
          </div>
        </div>

        <p v-if="metrics.truncated" class="small text-warning mt-2 mb-0" data-testid="metrics-truncated">
          {{ t('instructor.truncated') }}
        </p>

        <div class="row g-3 mt-1">
          <div class="col-12 col-lg-4">
            <h3 class="h7">{{ t('instructor.commonIncorrectActions') }}</h3>
            <RankingTable :rows="incorrectRows" test-id="ranking-incorrect" :empty-label="t('instructor.noRanked')" :key-label="t('instructor.key')" :count-label="t('instructor.count')" />
          </div>
          <div class="col-12 col-lg-4">
            <h3 class="h7">{{ t('instructor.repeatedFaultTypes') }}</h3>
            <RankingTable :rows="faultRows" test-id="ranking-faults" :empty-label="t('instructor.noRanked')" :key-label="t('instructor.key')" :count-label="t('instructor.count')" />
          </div>
          <div class="col-12 col-lg-4">
            <h3 class="h7">{{ t('instructor.safetyMistakeRules') }}</h3>
            <RankingTable :rows="safetyRows" test-id="ranking-safety" :empty-label="t('instructor.noRanked')" :key-label="t('instructor.key')" :count-label="t('instructor.count')" />
          </div>
        </div>

        <p class="small text-muted mt-2 mb-0" data-testid="metrics-note">{{ metrics.educationalNote }}</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstructorMetricsDto } from '@fabrik3d/contracts'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import RankingTable from './RankingTable.vue'
import { metricCards, rankingRows } from '@/instructor/instructorView'

const props = defineProps<{
  metrics: InstructorMetricsDto | null
  loading: boolean
  error: string | null
}>()

const { t } = useI18n()
const cards = computed(() => (props.metrics ? metricCards(props.metrics) : []))
const incorrectRows = computed(() => rankingRows(props.metrics?.commonIncorrectActions ?? []))
const faultRows = computed(() => rankingRows(props.metrics?.repeatedFaultTypes ?? []))
const safetyRows = computed(() => rankingRows(props.metrics?.safetyMistakeRules ?? []))
</script>
