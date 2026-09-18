<template>
  <span class="hmi-status" :class="`hmi-status--${state}`" role="status">
    <i class="bi" :class="icon"></i><span>{{ label }}</span>
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
export type HmiVisualState = 'normal' | 'loading' | 'pending' | 'success' | 'warning' | 'fault' | 'disabled' | 'offline'
const props = withDefaults(defineProps<{ state: HmiVisualState; label: string }>(), { state: 'normal' })
const icon = computed(() => ({ normal: 'bi-info-circle', loading: 'bi-arrow-repeat', pending: 'bi-hourglass-split', success: 'bi-check-circle', warning: 'bi-exclamation-triangle', fault: 'bi-x-octagon', disabled: 'bi-slash-circle', offline: 'bi-wifi-off' })[props.state])
</script>
