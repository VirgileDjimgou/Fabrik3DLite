<template>
  <section class="hmi-authority" role="status" aria-live="polite" data-testid="authority-indicator">
    <div class="hmi-authority__row">
      <HmiStatusIndicator :state="visualState" :label="`${modeLabel} · ${stateLabel}`" />
      <span class="hmi-authority__target" data-testid="authority-target">{{ target }}</span>
    </div>

    <dl class="hmi-authority__meta">
      <div>
        <dt>{{ t('authority.owner') }}</dt>
        <dd data-testid="authority-owner">{{ authority?.ownerId ?? t('authority.none') }}</dd>
      </div>
      <div>
        <dt>{{ t('authority.state') }}</dt>
        <dd data-testid="authority-state">{{ stateLabel }}</dd>
      </div>
    </dl>

    <p v-if="authority?.state === 'degraded'" class="hmi-authority__degraded" data-testid="authority-degraded">
      {{ t('authority.degradedNotice') }}
    </p>

    <div class="hmi-authority__actions">
      <button type="button" class="btn-hmi" data-testid="authority-acquire" @click="$emit('acquire')">
        {{ t('authority.acquire') }}
      </button>
      <button
        type="button"
        class="btn-hmi"
        data-testid="authority-release"
        :disabled="authority?.state !== 'held'"
        @click="$emit('release')"
      >
        {{ t('authority.release') }}
      </button>
      <button type="button" class="btn-hmi" data-testid="authority-takeover" :disabled="!canTakeover" @click="$emit('takeover')">
        {{ t('authority.takeover') }}
      </button>
    </div>

    <p v-if="feedback !== 'idle'" class="hmi-authority__feedback" :data-feedback="feedback" data-testid="authority-feedback">
      {{ feedbackLabel }}<span v-if="feedbackMessage"> ({{ feedbackMessage }})</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiStatusIndicator from './HmiStatusIndicator.vue'
import { authorityModeKey, authorityStateKey, authorityVisualState, type HandoverFeedback } from '@/composables/authorityView'
import type { ControlAuthorityDto } from '@/services/api'

const props = withDefaults(defineProps<{
  authority: ControlAuthorityDto | null
  target: string
  feedback?: HandoverFeedback
  feedbackMessage?: string | null
  /** A forced takeover is an Engineer capability; the server still enforces it. */
  canTakeover?: boolean
}>(), { canTakeover: true })

defineEmits<{
  acquire: []
  release: []
  takeover: []
}>()

const { t } = useI18n()

const visualState = computed(() => authorityVisualState(props.authority))
const modeLabel = computed(() => t(authorityModeKey(props.authority?.mode)))
const stateLabel = computed(() => t(authorityStateKey(props.authority?.state)))
const feedbackLabel = computed(() => {
  switch (props.feedback) {
    case 'pending': return t('authority.pending')
    case 'success': return t('authority.success')
    case 'failure': return t('authority.failure')
    default: return ''
  }
})
</script>

<style scoped>
.hmi-authority { display: grid; gap: 0.25rem; padding: 0.5rem 0.75rem; border: 1px solid var(--hmi-border, #444); border-radius: 0.375rem; }
.hmi-authority__row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.hmi-authority__target { font-weight: 600; }
.hmi-authority__meta { display: flex; gap: 1rem; margin: 0; }
.hmi-authority__meta dt { font-size: 0.75rem; opacity: 0.75; }
.hmi-authority__meta dd { margin: 0; font-weight: 600; }
.hmi-authority__degraded { color: var(--hmi-fault, #d9534f); font-weight: 600; margin: 0; }
.hmi-authority__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.hmi-authority__feedback { margin: 0; font-size: 0.8rem; }
</style>
