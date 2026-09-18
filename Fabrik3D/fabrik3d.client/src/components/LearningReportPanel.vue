<template>
  <aside class="report-panel" aria-label="Learning assessment and report">
    <strong>LEARNING ASSESSMENT</strong>
    <label>Session alias <input v-model="alias" maxlength="40" placeholder="anonymous learner" /></label>
    <p>Score: <b>{{ report.assessment.score }}/{{ report.assessment.possibleScore }}</b></p>
    <ul><li v-for="criterion in report.assessment.criteria" :key="criterion.id" :class="criterion.passed ? 'pass' : 'fail'">{{ criterion.label }}: {{ criterion.passed ? 'passed' : 'not passed' }} — {{ criterion.observed }}</li></ul>
    <button @click="exportJson">Export JSON</button><button @click="exportHtml">Export HTML</button>
    <label><input v-model="instructor" type="checkbox" /> Instructor mode</label>
    <section v-if="instructor"><b>Expected vs observed</b><p>Expected: {{ expectedActions.join(', ') || 'No configured actions' }}</p><p>Observed: {{ report.observedActions.join(', ') || 'None yet' }}</p><button @click="$emit('reset-scenario')">Reset scenario (instructor)</button></section>
  </aside>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { createLearningReport, renderLearningReportHtml } from '../learning/report'
import type { TimelineEntry } from '../timeline'
const props = defineProps<{ entries: readonly TimelineEntry[]; expectedActions: readonly string[] }>()
defineEmits<{ 'reset-scenario': [] }>()
const alias = ref('')
const instructor = ref(false)
const report = computed(() => createLearningReport(props.entries, alias.value, props.expectedActions))
function download(name: string, type: string, content: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url) }
function exportJson(): void { download('fabrik3d-learning-report.json', 'application/json', JSON.stringify(report.value, null, 2)) }
function exportHtml(): void { download('fabrik3d-learning-report.html', 'text/html', renderLearningReportHtml(report.value)) }
</script>
<style scoped>
.report-panel{position:fixed;left:1rem;bottom:1rem;z-index:20;max-width:23rem;padding:.8rem;background:#142535;color:#fff;border:2px solid #58b4d9}.report-panel label,.report-panel button{margin:.25rem}.report-panel ul{padding-left:1.2rem;font-size:.78rem}.pass{color:#95d5a2}.fail{color:#ffb4a2}.report-panel section{margin-top:.4rem;padding-top:.4rem;border-top:1px solid #607d8b;font-size:.8rem}
</style>
