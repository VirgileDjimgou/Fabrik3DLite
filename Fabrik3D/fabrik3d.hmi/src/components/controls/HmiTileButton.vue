<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="hmi-tile"
    @click="$emit('click')"
  >
    <i class="bi" :class="icon" aria-hidden="true"></i>
    <span>{{ label }}</span>
  </component>
</template>

<script setup lang="ts">
defineProps<{ icon: string; label: string; to?: string }>()
defineEmits<{ click: [] }>()
</script>
