<template>
  <section v-if="available" class="hmi-card" data-testid="hmi-demo-reset">
    <div class="hmi-card__body">
      <h6 class="hmi-section-title mb-2">
        <i class="bi bi-arrow-counterclockwise hmi-icon me-1"></i>{{ t('demo.title') }}
      </h6>
      <p class="small text-muted mb-2">{{ t('demo.resetScope') }}</p>
      <button
        type="button"
        class="btn btn-outline-danger"
        :disabled="busy"
        data-testid="hmi-demo-reset-button"
        @click="confirmOpen = true"
      >
        <i class="bi bi-arrow-counterclockwise me-1"></i>{{ busy ? t('demo.resetting') : t('demo.reset') }}
      </button>
      <p v-if="status === 'success'" class="hmi-success mt-2" role="status" data-testid="hmi-demo-reset-success">
        {{ t('demo.resetSuccess') }}
      </p>
      <p v-if="status === 'failure'" class="hmi-error mt-2" role="alert" data-testid="hmi-demo-reset-failure">
        {{ t('demo.resetFailed') }}
      </p>
    </div>

    <HmiConfirmationDialog
      :open="confirmOpen"
      :title="t('demo.reset')"
      :message="t('demo.resetScope')"
      :target-label="t('demo.title')"
      target="public-demo"
      :confirm-label="t('demo.reset')"
      :cancel-label="t('common.cancel')"
      @confirm="runReset"
      @cancel="confirmOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiConfirmationDialog from '@/components/controls/HmiConfirmationDialog.vue'
import { fetchAuthConfig } from '@/auth/authService'
import { canOperate } from '@/auth/authStore'
import { resetDemo } from '@/services/api'
import type { AuthConfig } from '@/auth/authTypes'

const { t } = useI18n()
const config = ref<AuthConfig | null>(null)
const confirmOpen = ref(false)
const busy = ref(false)
const status = ref<'idle' | 'success' | 'failure'>('idle')

// The affordance exists only when the server advertises the explicit demo profile and the operator
// holds the operate permission. The server re-checks both; hidden UI is not a control.
const available = computed(() => Boolean(config.value?.demoResetEnabled) && canOperate())

onMounted(async () => {
  try {
    config.value = await fetchAuthConfig()
  } catch {
    // No server configuration: the reset affordance stays hidden rather than guessing.
  }
})

async function runReset(): Promise<void> {
  confirmOpen.value = false
  busy.value = true
  status.value = 'idle'
  try {
    await resetDemo()
    status.value = 'success'
  } catch {
    status.value = 'failure'
  } finally {
    busy.value = false
  }
}
</script>
