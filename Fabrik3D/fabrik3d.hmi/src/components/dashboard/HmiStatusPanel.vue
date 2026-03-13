<template>
  <div>
    <!-- Tempo gauge -->
    <div class="text-center mb-3">
      <HmiGauge :value="tempoPercent" :label="t('status.tempo')" :size="140" />
      <div class="d-flex justify-content-center gap-3 mt-2">
        <span class="badge bg-light text-primary border">{{ t('status.slow') }}</span>
        <span class="badge bg-light text-primary border">{{ t('status.fast') }}</span>
      </div>
    </div>

    <!-- Progress gauge -->
    <div class="text-center mb-3">
      <HmiGauge :value="progressPercent" :label="t('status.progress')" :size="140" />
      <router-link to="/current-job" class="small" style="color: var(--hmi-icon-color)">
        {{ t('status.details') }}
      </router-link>
    </div>

    <!-- State details -->
    <ul class="list-group list-group-flush small">
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.machineMode') }}</span>
        <strong>{{ machine?.machineMode ?? '-' }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.robotState') }}</span>
        <strong>{{ machine?.robotState ?? '-' }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.cncState') }}</span>
        <strong>{{ machine?.cncState ?? '-' }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.currentPhase') }}</span>
        <strong>{{ machine?.currentPhase ?? '-' }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.currentPallet') }}</span>
        <strong>{{ machine?.currentPalletId ?? '-' }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.currentSlot') }}</span>
        <strong>R{{ machine?.currentSlotRow ?? 0 }} C{{ machine?.currentSlotColumn ?? 0 }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.machined') }}</span>
        <strong>{{ session?.machinedCount ?? 0 }}</strong>
      </li>
      <li class="list-group-item d-flex justify-content-between">
        <span class="text-muted">{{ t('status.remaining') }}</span>
        <strong>{{ session?.remainingCount ?? 0 }}</strong>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MachineStateDto, SimulationSessionDto, JobDto } from '@/services/api'
import HmiGauge from '@/components/controls/HmiGauge.vue'

const props = defineProps<{
  machine: MachineStateDto | null
  session: SimulationSessionDto | null
  currentJob: JobDto | null
}>()

const { t } = useI18n()

const progressPercent = computed(() => {
  if (props.currentJob) return props.currentJob.progressPercent
  const s = props.session
  if (!s || s.totalCount === 0) return 0
  return Math.round((s.machinedCount / s.totalCount) * 100)
})

const tempoPercent = computed(() => props.machine?.isRunning ? 50 : 0)
</script>
