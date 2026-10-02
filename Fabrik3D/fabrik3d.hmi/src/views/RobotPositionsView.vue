<template>
  <div data-testid="robot-positions">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="hmi-page-title"><i class="bi bi-robot hmi-icon me-2"></i>{{ t('robotPositions.title') }}</h5>
      <span class="hmi-detail hmi-mono hmi-truncate" data-testid="robot-target">{{ cellId }} · {{ robotId }}</span>
    </div>

    <div v-if="telemetry === 'loading'" class="hmi-card">
      <div class="hmi-card__body text-center py-5" role="status" data-testid="robot-loading">
        <div class="spinner-border" role="presentation"></div>
        <p class="hmi-detail mt-3 mb-0">{{ t('robotPositions.loading') }}</p>
      </div>
    </div>

    <HmiEmptyState
      v-else-if="telemetry === 'unavailable'"
      :title="t('robotPositions.unavailable')"
      :detail="t('robotPositions.unavailableDetail')"
    >
      <button type="button" class="btn btn-hmi mt-2" data-testid="robot-refresh" @click="refresh">{{ t('robotPositions.refresh') }}</button>
    </HmiEmptyState>

    <HmiErrorState
      v-else-if="telemetry === 'offline'"
      :title="t('robotPositions.offline')"
      :detail="t('robotPositions.offlineDetail')"
    />

    <template v-else-if="positions">
      <div v-if="positions.isStale" class="alert alert-warning py-2" role="alert" data-testid="robot-stale">
        {{ t('robotPositions.stale') }}
      </div>

      <!-- Pendant header: state, authority, mode and motion are read first. -->
      <section class="hmi-status-strip mb-3" :class="pendantStripClass" data-testid="robot-status-strip">
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('robotPositions.state') }}</span>
          <span class="hmi-value hmi-value--primary" data-testid="robot-state">{{ positions.motionStatus }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('authority.title') }}</span>
          <span class="hmi-value" data-testid="robot-authority">
            {{ t(authorityStateKey(positions.controlAuthorityState)) }} · {{ t(authorityModeKey(positions.controlAuthorityMode)) }}
          </span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('robotPositions.operatingMode') }}</span>
          <span class="hmi-value" data-testid="robot-mode">{{ positions.operatingMode }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('robotPositions.model') }}</span>
          <span class="hmi-value hmi-truncate" data-testid="robot-model">{{ positions.robotModel }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('robotPositions.units') }}</span>
          <span class="hmi-value" data-testid="robot-units">{{ positions.units }}</span>
        </div>
      </section>

      <div class="hmi-pendant">
        <!-- Joints: compact rows with angle and declared limits. -->
        <section class="hmi-card" data-testid="robot-joints">
          <div class="hmi-card__header"><span>{{ t('robotPositions.joints') }}</span></div>
          <div class="hmi-card__body hmi-pendant__joints">
            <div v-for="joint in positions.joints" :key="joint.index" class="hmi-pendant__joint" :data-testid="`robot-joint-${joint.name}`">
              <span class="hmi-pendant__joint-name">{{ joint.name }}</span>
              <span class="hmi-pendant__joint-angle">
                {{ degrees(joint.angleRadians).toFixed(1) }}° <span class="hmi-detail">({{ joint.angleRadians.toFixed(3) }} rad)</span>
              </span>
              <span class="hmi-pendant__joint-limits">{{ joint.minRadians.toFixed(2) }} … {{ joint.maxRadians.toFixed(2) }} rad</span>
            </div>
          </div>
        </section>

        <!-- TCP and frames/tool -->
        <div class="row g-3">
          <div class="col-md-6">
            <div class="hmi-card h-100">
              <div class="hmi-card__header"><span>{{ t('robotPositions.tcp') }}</span></div>
              <div class="hmi-card__body">
                <div class="hmi-mono" data-testid="robot-tcp">X {{ positions.tcp.x.toFixed(3) }} · Y {{ positions.tcp.y.toFixed(3) }} · Z {{ positions.tcp.z.toFixed(3) }}</div>
                <div class="hmi-mono mt-2" data-testid="robot-orientation">
                  Rx {{ positions.tcp.rx.toFixed(3) }} · Ry {{ positions.tcp.ry.toFixed(3) }} · Rz {{ positions.tcp.rz.toFixed(3) }}
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="hmi-card h-100">
              <div class="hmi-card__header"><span>{{ t('robotPositions.frames') }}</span></div>
              <div class="hmi-card__body">
                <div>{{ t('robotPositions.base') }}: <span class="hmi-mono">{{ positions.frames.baseFrame }}</span></div>
                <div>{{ t('robotPositions.tool') }}: <span class="hmi-mono">{{ positions.frames.toolFrame }}</span></div>
                <div>{{ t('robotPositions.workObject') }}: <span class="hmi-mono">{{ positions.frames.workObjectFrame }}</span></div>
                <div>{{ t('robotPositions.currentTool') }}: <span class="hmi-mono">{{ positions.frames.currentToolId }}</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Manual jog: held action with dead-man feedback. -->
        <section class="hmi-card" data-testid="robot-jog">
          <div class="hmi-card__header">
            <span>{{ t('robotPositions.jogTitle') }}</span>
            <span class="hmi-detail">{{ t('robotPositions.jogMode') }}: {{ mode }}</span>
          </div>
          <div class="hmi-card__body">
            <p v-if="!availability.allowed" class="mb-2 text-warning" data-testid="robot-jog-blocked">
              {{ t(`robotPositions.reason.${availability.reason ?? 'mode'}`) }}
            </p>
            <div v-if="mode !== 'manual-training'" class="mb-3">
              <button type="button" class="btn btn-hmi" data-testid="robot-enable-jog" @click="confirmOpen = true">
                {{ t('robotPositions.enableJog') }}
              </button>
            </div>

            <div v-for="joint in positions.joints" :key="joint.name" class="hmi-pendant__joint mb-2">
              <span class="hmi-pendant__joint-name">{{ joint.name }}</span>
              <span class="hmi-pendant__joint-angle">{{ degrees(joint.angleRadians).toFixed(1) }}°</span>
              <span class="hmi-pendant__jog">
                <button
                  type="button"
                  class="btn-hmi"
                  :disabled="!availability.allowed"
                  :aria-label="`${joint.name} -`"
                  :data-testid="`robot-jog-${joint.name}-minus`"
                  @pointerdown.prevent="onPress(joint.name, -1)"
                  @pointerup="onRelease"
                  @pointerleave="onRelease"
                  @keydown.enter.prevent="onPress(joint.name, -1)"
                  @keydown.space.prevent="onPress(joint.name, -1)"
                  @keyup.enter.prevent="onRelease"
                  @keyup.space.prevent="onRelease"
                >−</button>
                <button
                  type="button"
                  class="btn-hmi"
                  :disabled="!availability.allowed"
                  :aria-label="`${joint.name} +`"
                  :data-testid="`robot-jog-${joint.name}-plus`"
                  @pointerdown.prevent="onPress(joint.name, 1)"
                  @pointerup="onRelease"
                  @pointerleave="onRelease"
                  @keydown.enter.prevent="onPress(joint.name, 1)"
                  @keydown.space.prevent="onPress(joint.name, 1)"
                  @keyup.enter.prevent="onRelease"
                  @keyup.space.prevent="onRelease"
                >+</button>
              </span>
            </div>

            <p class="mb-0 hmi-detail" :data-feedback="feedback" data-testid="robot-jog-feedback" aria-live="polite">
              <span v-if="feedback === 'pending'">{{ t('robotPositions.pending') }}</span>
              <span v-else-if="feedback === 'success'">{{ t('robotPositions.accepted') }}</span>
              <span v-else-if="feedback === 'failure'">
                {{ t('robotPositions.rejected') }}<span v-if="feedbackMessage"> ({{ feedbackMessage }})</span>
              </span>
              <span v-else>{{ t('robotPositions.deadMan') }}</span>
            </p>
          </div>
        </section>
      </div>
    </template>

    <HmiConfirmationDialog
      :open="confirmOpen"
      :title="t('robotPositions.enableJogTitle')"
      :message="t('robotPositions.enableJogMessage')"
      :target-label="t('robotPositions.targetLabel')"
      :target="`${cellId} · ${robotId}`"
      :confirm-label="t('robotPositions.enableJog')"
      :cancel-label="t('common.cancel')"
      @confirm="enableManualJog"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'
import HmiConfirmationDialog from '@/components/controls/HmiConfirmationDialog.vue'
import { useRobotPositions } from '@/composables/useRobotPositions'
import { useOperatingMode } from '@/composables/useOperatingMode'
import { authorityModeKey, authorityStateKey } from '@/composables/authorityView'

const { t } = useI18n()
const { cellId, robotId, positions, telemetry, feedback, feedbackMessage, availability, refresh, press, release } = useRobotPositions()
const { mode, transition } = useOperatingMode()

const confirmOpen = ref(false)

const pendantStripClass = computed(() => {
  const p = positions.value
  if (!p) return ''
  if (p.isStale) return 'hmi-status-strip--warning'
  if (p.motionStatus === 'MOVING' || p.motionStatus === 'RUNNING') return 'hmi-status-strip--success'
  if (p.motionStatus === 'FAULT' || p.motionStatus === 'ERROR') return 'hmi-status-strip--fault'
  return ''
})

function degrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function onPress(joint: string, direction: -1 | 1): void {
  void press(joint, direction)
}

function onRelease(): void {
  void release()
}

function enableManualJog(): void {
  transition('manual-training')
  confirmOpen.value = false
}
</script>
