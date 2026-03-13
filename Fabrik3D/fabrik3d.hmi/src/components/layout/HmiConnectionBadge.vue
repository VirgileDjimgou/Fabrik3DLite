<template>
  <span class="badge" :class="connected ? 'bg-success' : 'bg-secondary'">
    <i class="bi" :class="connected ? 'bi-wifi' : 'bi-wifi-off'"></i>
    {{ connected ? t('status.connected') : t('status.disconnected') }}
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ connected: boolean }>()
const { t } = useI18n()
</script>
