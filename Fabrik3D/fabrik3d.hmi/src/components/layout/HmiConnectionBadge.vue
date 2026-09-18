<template>
  <HmiStatusIndicator :state="state" :label="label" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiStatusIndicator, { type HmiVisualState } from '../controls/HmiStatusIndicator.vue'

const props = defineProps<{ connectionState: string }>()
const { t } = useI18n()

const state = computed<HmiVisualState>(() => {
  switch (props.connectionState) {
    case 'connected': return 'success'
    case 'reconnecting': return 'pending'
    default: return 'offline'
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
