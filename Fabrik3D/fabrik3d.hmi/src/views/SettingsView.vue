<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-gear hmi-icon me-2"></i>{{ t('settings.title') }}</h5>
    <div class="card mb-3">
      <div class="card-body">
        <div class="mb-3">
          <label class="form-label fw-semibold">{{ t('settings.language') }}</label>
          <select v-model="locale" class="form-select" style="max-width: 200px">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="fr">Fran&ccedil;ais</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-semibold">{{ t('settings.backendUrl') }}</label>
          <input type="text" class="form-control" :value="backendUrl" readonly />
        </div>
        <div>
          <label class="form-label fw-semibold">{{ t('settings.connectionStatus') }}</label>
          <div>
            <span class="badge" :class="healthOk ? 'bg-success' : 'bg-secondary'">
              {{ healthOk ? t('status.connected') : t('status.disconnected') }}
            </span>
            <span v-if="healthVersion" class="ms-2 small text-muted">v{{ healthVersion }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'

const { t, locale } = useI18n()
const backendUrl = (import.meta.env.VITE_ORCHESTRATOR_URL as string) || window.location.origin
const healthOk = ref(false)
const healthVersion = ref('')

onMounted(async () => {
  try {
    const h = await api.getHealth()
    healthOk.value = h.status === 'Healthy'
    healthVersion.value = h.version
  } catch { healthOk.value = false }
})
</script>
