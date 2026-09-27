<template>
  <div v-if="open" class="hmi-confirm-backdrop" role="presentation" @click.self="$emit('cancel')">
    <section
      class="hmi-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hmi-confirm-title"
      aria-describedby="hmi-confirm-message"
      @keydown.esc.stop="$emit('cancel')"
    >
      <h2 id="hmi-confirm-title">{{ title }}</h2>
      <p id="hmi-confirm-message">{{ message }}</p>
      <p><strong>{{ targetLabel }}:</strong> <span data-testid="confirm-target">{{ target }}</span></p>
      <div>
        <button ref="cancelButton" type="button" class="btn btn-secondary" @click="$emit('cancel')">{{ cancelLabel }}</button>
        <button ref="confirmButton" type="button" class="btn btn-hmi" @click="$emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
const props = defineProps<{ open: boolean; title: string; message: string; targetLabel: string; target: string; confirmLabel: string; cancelLabel: string }>()
defineEmits<{ confirm: []; cancel: [] }>()

const confirmButton = ref<HTMLButtonElement | null>(null)

// Keyboard behaviour (S49): a confirmation dialog opens focused on the confirm action so an
// operator can act without a pointer, and Escape always cancels. Color/target identify the action.
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    confirmButton.value?.focus()
  }
}, { immediate: true })
</script>
