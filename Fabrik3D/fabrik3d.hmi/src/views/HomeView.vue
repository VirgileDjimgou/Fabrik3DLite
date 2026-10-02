<template>
  <div data-testid="hmi-overview">
    <h5 class="hmi-page-title mb-3"><i class="bi bi-speedometer2 hmi-icon me-2"></i>{{ t('overview.title') }}</h5>

    <!-- Primary hierarchy: cell state, mode, authority, current job and progress are read first. -->
    <section class="hmi-status-strip mb-3" :class="cellStripClass" data-testid="overview-status-strip">
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('overview.cellState') }}</span>
        <span class="hmi-value hmi-value--primary" data-testid="overview-cell-state">{{ cellStateLabel }}</span>
      </div>
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('status.machineMode') }}</span>
        <span class="hmi-value" data-testid="overview-mode">{{ machine?.machineMode ?? '-' }}</span>
      </div>
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('authority.title') }}</span>
        <span class="hmi-value" data-testid="overview-authority">{{ authorityLabel }}</span>
      </div>
      <div class="hmi-metric flex-grow-1">
        <span class="hmi-label">{{ t('overview.currentJob') }}</span>
        <span class="hmi-value hmi-truncate" data-testid="overview-current-job">{{ currentJob?.name ?? t('overview.noJob') }}</span>
      </div>
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('status.progress') }}</span>
        <span class="hmi-value" data-testid="overview-progress">{{ progressPercent }}%</span>
      </div>
    </section>

    <!-- Secondary hierarchy: robot/CNC state, parts completed and cycle duration. -->
    <section class="row g-2 mb-3" data-testid="overview-secondary">
      <div class="col-6 col-md-3">
        <div class="hmi-card h-100"><div class="hmi-card__body hmi-metric">
          <span class="hmi-label">{{ t('status.robotState') }}</span>
          <span class="hmi-value" data-testid="overview-robot-state">{{ machine?.robotState ?? '-' }}</span>
        </div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="hmi-card h-100"><div class="hmi-card__body hmi-metric">
          <span class="hmi-label">{{ t('status.cncState') }}</span>
          <span class="hmi-value" data-testid="overview-cnc-state">{{ machine?.cncState ?? '-' }}</span>
        </div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="hmi-card h-100"><div class="hmi-card__body hmi-metric">
          <span class="hmi-label">{{ t('overview.partsCompleted') }}</span>
          <span class="hmi-value" data-testid="overview-parts">{{ session?.machinedCount ?? 0 }}</span>
        </div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="hmi-card h-100"><div class="hmi-card__body hmi-metric">
          <span class="hmi-label">{{ t('overview.cycleDuration') }}</span>
          <span class="hmi-value" data-testid="overview-cycle">{{ cycleDuration }}</span>
        </div></div>
      </div>
    </section>

    <!-- Primary actions: the operator's next steps, ranked above the secondary tiles. -->
    <h6 class="hmi-section-title mb-2">{{ t('overview.primaryActions') }}</h6>
    <div class="row g-3 mb-3" data-testid="overview-primary-actions">
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-play-circle" :label="t('tiles.selectJobToStart')" to="/jobs" />
      </div>
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-arrow-repeat" :label="t('tiles.currentJob')" to="/current-job" />
      </div>
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-card-list" :label="t('tiles.jobList')" to="/jobs" />
      </div>
      <div v-if="operator" class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-plus-square" :label="t('tiles.newJob')" to="/new-job" />
      </div>
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-robot" :label="t('tiles.robotPositions')" to="/robot-positions" />
      </div>
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-exclamation-triangle" :label="t('alarms.title')" to="/alarms" />
      </div>
    </div>

    <h6 class="hmi-section-title mb-2">{{ t('overview.more') }}</h6>
    <div class="row g-3" data-testid="overview-secondary-actions">
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-grid-3x3-gap" :label="t('tiles.extras')" />
      </div>
      <div class="col-lg-4 col-md-6 col-sm-6">
        <HmiTileButton icon="bi-gear" :label="t('tiles.settings')" to="/settings" />
      </div>
    </div>

    <!-- Bounded public-demo lifecycle (S63): visible only in the explicit demo profile. -->
    <HmiDemoReset class="mt-3" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiTileButton from '@/components/controls/HmiTileButton.vue'
import HmiDemoReset from '@/components/demo/HmiDemoReset.vue'
import { canOperate } from '@/auth/authStore'
import { useMachineState } from '@/composables/useMachineState'
import { useControlAuthority } from '@/composables/useControlAuthority'
import { authorityModeKey, authorityStateKey } from '@/composables/authorityView'

const { t } = useI18n()
const operator = computed(() => canOperate())
const { machine, currentJob, session } = useMachineState()
const { authority } = useControlAuthority()

const cellStateLabel = computed(() => {
  const m = machine.value
  if (!m) return t('status.disconnected')
  if (m.isRunning) return t('status.running')
  if (m.isPaused) return t('status.paused')
  return t('status.idle')
})

const cellStripClass = computed(() => {
  const m = machine.value
  if (!m) return 'hmi-status-strip--offline'
  if (m.isRunning) return 'hmi-status-strip--success'
  if (m.isPaused) return 'hmi-status-strip--warning'
  return ''
})

const authorityLabel = computed(() =>
  `${t(authorityModeKey(authority.value?.mode))} · ${t(authorityStateKey(authority.value?.state))}`)

const progressPercent = computed(() => {
  if (currentJob.value) return currentJob.value.progressPercent
  const s = session.value
  if (!s || s.totalCount === 0) return 0
  return Math.round((s.machinedCount / s.totalCount) * 100)
})

const cycleDuration = computed(() => {
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
</script>
