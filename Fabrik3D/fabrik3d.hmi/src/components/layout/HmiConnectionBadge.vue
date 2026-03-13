<template>
  <span class="badge" :class="badgeClass">
    <i class="bi" :class="iconClass"></i>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ connectionState: string }>()
const { t } = useI18n()

const badgeClass = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'bg-success'
    case 'reconnecting': return 'bg-warning text-dark'
    default: return 'bg-secondary'
  }
})

const iconClass = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'bi-wifi'
    case 'reconnecting': return 'bi-arrow-repeat'
    default: return 'bi-wifi-off'
  }
})

const label = computed(() => {
  switch (props.connectionState) {
    case 'connected': return t('status.connected')
    case 'reconnecting': return t('status.reconnecting')
    default: return t('status.disconnected')
  }
})
</script>
