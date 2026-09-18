<template>
  <aside class="step-panel" :style="panelStyle" aria-label="Simulation learning controls">
    <div class="drag-handle" @pointerdown="beginDrag">⠿ Move panel</div>
    <header><strong>Guided simulation</strong><label><input v-model="enabled" type="checkbox" @change="$emit('toggle', enabled)"> Step mode</label></header>
    <label class="speed">Speed <input :value="speed" type="range" min="0.25" max="4" step="0.25" @input="$emit('speed', Number(($event.target as HTMLInputElement).value))"> {{ speed }}×</label>
    <label><input v-model="expert" type="checkbox" @change="$emit('expert', expert)"> Expert diagnostics</label>
    <p><b>{{ checkpoint?.command ?? 'Run mode' }}</b><br>{{ checkpoint?.explanation ?? 'The workflow runs continuously with all safety checks enabled.' }}</p>
    <p class="result">Expected: {{ checkpoint?.expectedResult ?? 'Continuous execution' }}</p>
    <div class="controls">
      <button :disabled="!enabled || !checkpoint" @click="$emit('previous')">Previous explanation</button>
      <button :disabled="!enabled || !checkpoint" @click="$emit('next')">Next step</button>
      <button @click="$emit('restart')">Restart</button>
    </div>
  </aside>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import type { LearningCheckpoint } from '../learning/StepModeController'
const props = defineProps<{ active: boolean; checkpoint: LearningCheckpoint | null; speed: number }>()
defineEmits<{ (e: 'toggle', value: boolean): void; (e: 'speed', value: number): void; (e: 'expert', value: boolean): void; (e: 'next'): void; (e: 'previous'): void; (e: 'restart'): void }>()
const enabled = ref(props.active)
const expert = ref(false)
const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:guide', { x: 16, y: 16 })
watch(() => props.active, (value) => { enabled.value = value })
</script>
<style scoped>.step-panel{z-index:31;width:min(20rem,calc(100vw - 2rem));padding:.75rem;background:#10232dE8;color:#edf6f8;border:1px solid #34758a;border-radius:.4rem;font: .78rem/1.35 system-ui}.drag-handle{cursor:grab;color:#9de3f6;font-weight:700;user-select:none;margin:-.3rem 0 .35rem}.drag-handle:active{cursor:grabbing}.step-panel header{display:flex;justify-content:space-between;gap:.4rem;color:#9de3f6}.step-panel p{margin:.6rem 0}.speed{display:flex;gap:.4rem;align-items:center;margin:.35rem 0}.speed input{flex:1}.result{color:#f4d268}.controls{display:flex;flex-wrap:wrap;gap:.35rem}.controls button{padding:.35rem .5rem;border:0;border-radius:.2rem;background:#1d6d83;color:#fff}.controls button:disabled{opacity:.45}</style>
