<template>
  <aside class="report-panel" :style="panelStyle" aria-label="Learning assessment and report">
    <strong class="drag-handle" @pointerdown="beginDrag">⠿ LEARNING ASSESSMENT</strong>
    <label>{{ t('learning.alias') }} <input v-model="alias" maxlength="40" :placeholder="t('learning.anonymous')" /></label>
    <p>{{ t('learning.score') }}: <b>{{ report.assessment.score }}/{{ report.assessment.possibleScore }}</b></p>
    <ul><li v-for="criterion in report.assessment.criteria" :key="criterion.id" :class="criterion.passed ? 'pass' : 'fail'">{{ criterion.label }}: {{ criterion.passed ? t('learning.passed') : t('learning.notPassed') }} — {{ criterion.observed }}</li></ul>
    <button @click="exportJson">{{ t('learning.exportJson') }}</button><button @click="exportHtml">{{ t('learning.exportHtml') }}</button>
    <label><input v-model="instructor" type="checkbox" /> {{ t('learning.instructor') }}</label>
    <section v-if="instructor"><b>{{ t('learning.expectedObserved') }}</b><p>{{ t('learning.expected') }}: {{ expectedActions.join(', ') || t('learning.none') }}</p><p>{{ t('learning.observed') }}: {{ report.observedActions.join(', ') || t('learning.none') }}</p><button @click="$emit('reset-scenario')">{{ t('learning.reset') }}</button></section>
  </aside>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { createLearningReport, renderLearningReportHtml } from '../learning/report'
import type { TimelineEntry } from '../timeline'
import { useSimulatorI18n } from '../i18n/simulator'
const props = defineProps<{ entries: readonly TimelineEntry[]; expectedActions: readonly string[] }>()
defineEmits<{ 'reset-scenario': [] }>()
const alias = ref('')
const instructor = ref(false)
const { t } = useSimulatorI18n()
const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:learning', { x: 16, y: Math.max(16, window.innerHeight - 230) })
const report = computed(() => createLearningReport(props.entries, alias.value, props.expectedActions))
function download(name: string, type: string, content: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url) }
function exportJson(): void { download('fabrik3d-learning-report.json', 'application/json', JSON.stringify(report.value, null, 2)) }
function exportHtml(): void { download('fabrik3d-learning-report.html', 'text/html', renderLearningReportHtml(report.value)) }
</script>
<style scoped>
.report-panel{z-index:20;max-width:23rem;padding:.8rem;background:#142535;color:#fff;border:2px solid #58b4d9}.drag-handle{display:block;cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}.report-panel label,.report-panel button{margin:.25rem}.report-panel ul{padding-left:1.2rem;font-size:.78rem}.pass{color:#95d5a2}.fail{color:#ffb4a2}.report-panel section{margin-top:.4rem;padding-top:.4rem;border-top:1px solid #607d8b;font-size:.8rem}
</style>
