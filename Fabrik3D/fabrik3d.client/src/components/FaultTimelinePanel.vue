<template>
  <aside class="fault-panel" :style="panelStyle" aria-label="Simulated faults and event timeline">
    <strong class="drag-handle" @pointerdown="beginDrag">⠿ SIMULATED FAULT LAB</strong>
    <p>{{ t('fault.training') }}</p>
    <label>{{ t('fault.inject') }} <select v-model="selected"><option v-for="fault in catalog" :key="fault.type" :value="fault.type">{{ fault.title[locale] }}</option></select></label>
    <button @click="$emit('inject', selected)">{{ t('fault.injectButton') }}</button>
    <section v-for="fault in faults" :key="fault.id" class="fault" :class="fault.severity">
      <b>{{ fault.title[locale] }}</b><br><small>{{ fault.recoveryInstructions[locale] }}</small>
      <div><button v-if="!fault.acknowledgedAt" @click="$emit('action', fault.id, 'acknowledge')">{{ t('fault.acknowledge') }}</button><button v-if="fault.acknowledgedAt && fault.requiresReset && !fault.resetAt" @click="$emit('action', fault.id, 'reset')">{{ t('dashboard.reset') }}</button><button v-if="fault.acknowledgedAt && (!fault.requiresReset || fault.resetAt)" @click="$emit('action', fault.id, 'retry')">{{ t('fault.retry') }}</button></div>
    </section>
    <ol><li v-for="entry in entries.slice(-8)" :key="entry.sequence">#{{ entry.sequence }} {{ entry.kind }} · {{ entry.equipmentId }} · simulated</li></ol>
  </aside>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { FAULT_CATALOG, type ActiveFault, type FaultAction, type FaultType } from '../faults'
import type { TimelineEntry } from '../timeline'
import { useSimulatorI18n } from '../i18n/simulator'
defineProps<{ faults: readonly ActiveFault[]; entries: readonly TimelineEntry[] }>()
defineEmits<{ inject: [type: FaultType]; action: [id: string, action: FaultAction] }>()
const catalog = FAULT_CATALOG
const selected = ref<FaultType>('collision-risk')
const { t, locale } = useSimulatorI18n()
const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:faults', { x: Math.max(16, window.innerWidth - 370), y: Math.max(16, window.innerHeight - 230) })
</script>
<style scoped>
.fault-panel{z-index:20;max-width:22rem;padding:.8rem;background:#10212b;color:#fff;border:2px solid #f0b429}.drag-handle{display:block;cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}.fault-panel p{font-size:.78rem;color:#ffd77b}.fault-panel button,.fault-panel select{margin:.25rem}.fault{margin:.4rem 0;padding:.45rem;border-left:5px solid #e0a800;background:#263844}.fault.critical{border-color:#e04b4b}.fault.error{border-color:#f0a000}.fault small{display:block}.fault-panel ol{max-height:8rem;overflow:auto;font-size:.75rem;padding-left:1.2rem}
</style>
