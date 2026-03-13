<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-robot hmi-icon me-2"></i>{{ t('robotPositions.title') }}</h5>
    <div class="card">
      <div class="card-body text-center py-5">
        <i class="bi bi-robot hmi-icon" style="font-size: 3rem;"></i>
        <p class="text-muted mt-3">{{ t('robotPositions.placeholder') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
