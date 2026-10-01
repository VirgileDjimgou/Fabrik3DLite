<template>
  <div data-testid="robot-positions">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0"><i class="bi bi-robot hmi-icon me-2"></i>{{ t('robotPositions.title') }}</h5>
      <span class="small text-muted" data-testid="robot-target">{{ cellId }} · {{ robotId }}</span>
    </div>

    <div v-if="telemetry === 'loading'" class="card">
      <div class="card-body text-center py-5" role="status" data-testid="robot-loading">
        <div class="spinner-border" role="presentation"></div>
        <p class="text-muted mt-3 mb-0">{{ t('robotPositions.loading') }}</p>
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

      <div class="card mb-3">
        <div class="card-body">
          <div class="row g-2 small">
            <div class="col-6 col-md-3">
              <div class="text-muted">{{ t('robotPositions.model') }}</div>
              <div class="fw-semibold" data-testid="robot-model">{{ positions.robotModel }}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-muted">{{ t('robotPositions.units') }}</div>
              <div class="fw-semibold" data-testid="robot-units">{{ positions.units }}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-muted">{{ t('robotPositions.motion') }}</div>
              <div class="fw-semibold" data-testid="robot-motion">{{ positions.motionStatus }}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-muted">{{ t('robotPositions.operatingMode') }}</div>
              <div class="fw-semibold" data-testid="robot-mode">{{ positions.operatingMode }}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-muted">{{ t('authority.title') }}</div>
              <div class="fw-semibold" data-testid="robot-authority">
                {{ t(authorityStateKey(positions.controlAuthorityState)) }} · {{ t(authorityModeKey(positions.controlAuthorityMode)) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header">{{ t('robotPositions.joints') }}</div>
        <table class="table table-sm mb-0">
          <thead>
            <tr><th>{{ t('robotPositions.joint') }}</th><th>{{ t('robotPositions.angleRad') }}</th><th>{{ t('robotPositions.angleDeg') }}</th><th>{{ t('robotPositions.limits') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="joint in positions.joints" :key="joint.index" :data-testid="`robot-joint-${joint.name}`">
              <td>{{ joint.name }}</td>
              <td>{{ joint.angleRadians.toFixed(3) }}</td>
              <td>{{ degrees(joint.angleRadians).toFixed(1) }}</td>
              <td class="text-muted">{{ joint.minRadians.toFixed(2) }} … {{ joint.maxRadians.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header">{{ t('robotPositions.tcp') }}</div>
            <div class="card-body small">
              <div data-testid="robot-tcp">X {{ positions.tcp.x.toFixed(3) }} · Y {{ positions.tcp.y.toFixed(3) }} · Z {{ positions.tcp.z.toFixed(3) }}</div>
              <div class="mt-2" data-testid="robot-orientation">
                Rx {{ positions.tcp.rx.toFixed(3) }} · Ry {{ positions.tcp.ry.toFixed(3) }} · Rz {{ positions.tcp.rz.toFixed(3) }}
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header">{{ t('robotPositions.frames') }}</div>
            <div class="card-body small">
              <div>{{ t('robotPositions.base') }}: {{ positions.frames.baseFrame }}</div>
              <div>{{ t('robotPositions.tool') }}: {{ positions.frames.toolFrame }}</div>
              <div>{{ t('robotPositions.workObject') }}: {{ positions.frames.workObjectFrame }}</div>
              <div>{{ t('robotPositions.currentTool') }}: {{ positions.frames.currentToolId }}</div>
            </div>
          </div>
        </div>
      </div>

      <section class="card" data-testid="robot-jog">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>{{ t('robotPositions.jogTitle') }}</span>
          <span class="small text-muted">{{ t('robotPositions.jogMode') }}: {{ mode }}</span>
        </div>
        <div class="card-body">
          <p v-if="!availability.allowed" class="mb-2 text-warning" data-testid="robot-jog-blocked">
            {{ t(`robotPositions.reason.${availability.reason ?? 'mode'}`) }}
          </p>
          <div v-if="mode !== 'manual-training'" class="mb-3">
            <button type="button" class="btn btn-hmi" data-testid="robot-enable-jog" @click="confirmOpen = true">
              {{ t('robotPositions.enableJog') }}
            </button>
          </div>

          <div v-for="joint in positions.joints" :key="joint.name" class="d-flex align-items-center gap-2 mb-2">
            <span class="hmi-jog-label">{{ joint.name }}</span>
            <button
              type="button"
              class="btn-hmi hmi-jog-btn"
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
              class="btn-hmi hmi-jog-btn"
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
          </div>

          <p class="mb-0 small" :data-feedback="feedback" data-testid="robot-jog-feedback" aria-live="polite">
            <span v-if="feedback === 'pending'">{{ t('robotPositions.pending') }}</span>
            <span v-else-if="feedback === 'success'">{{ t('robotPositions.accepted') }}</span>
            <span v-else-if="feedback === 'failure'">
              {{ t('robotPositions.rejected') }}<span v-if="feedbackMessage"> ({{ feedbackMessage }})</span>
            </span>
            <span v-else class="text-muted">{{ t('robotPositions.deadMan') }}</span>
          </p>
        </div>
      </section>
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
import { ref } from 'vue'
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

<style scoped>
.hmi-jog-label { width: 2.5rem; font-weight: 600; }
.hmi-jog-btn { min-width: 44px; min-height: 44px; font-size: 1.1rem; }
</style>
