<template>
  <div v-if="open" class="hmi-confirm-backdrop" role="presentation" @click.self="$emit('cancel')">
    <section class="hmi-confirm" role="dialog" aria-modal="true" aria-labelledby="hmi-confirm-title">
      <h2 id="hmi-confirm-title">{{ title }}</h2><p>{{ message }}</p><p><strong>{{ targetLabel }}:</strong> {{ target }}</p>
      <div><button class="btn btn-secondary" @click="$emit('cancel')">{{ cancelLabel }}</button><button class="btn btn-hmi" @click="$emit('confirm')">{{ confirmLabel }}</button></div>
    </section>
  </div>
</template>
<script setup lang="ts">
defineProps<{ open: boolean; title: string; message: string; targetLabel: string; target: string; confirmLabel: string; cancelLabel: string }>()
defineEmits<{ confirm: []; cancel: [] }>()
</script>
