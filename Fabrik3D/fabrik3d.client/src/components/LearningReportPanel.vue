<template>
  <aside class="report-panel" :style="panelStyle" aria-label="Learning assessment and report">
    <strong class="drag-handle" @pointerdown="beginDrag">⠿ LEARNING ASSESSMENT</strong>
    <p class="authority" :class="authority === 'server' ? 'server' : 'local'">
      {{ t('learning.authority') }}: <b>{{ authority === 'server' ? t('learning.server') : t('learning.local') }}</b>
    </p>
    <label>{{ t('learning.alias') }} <input v-model="alias" maxlength="40" :placeholder="t('learning.anonymous')" /></label>
    <p>{{ t('learning.score') }}: <b>{{ report.assessment.score }}/{{ report.assessment.possibleScore }}</b></p>
    <p v-if="serverScore">{{ t('learning.serverScore') }}: <b>{{ serverScore.score }}/{{ serverScore.possibleScore }}</b></p>
    <ul><li v-for="criterion in report.assessment.criteria" :key="criterion.id" :class="criterion.passed ? 'pass' : 'fail'">{{ criterion.label }}: {{ criterion.passed ? t('learning.passed') : t('learning.notPassed') }} — {{ criterion.observed }}</li></ul>
    <button @click="exportJson">{{ t('learning.exportJson') }}</button><button @click="exportHtml">{{ t('learning.exportHtml') }}</button>
    <section v-if="syncConfigured" class="sync">
      <button :disabled="syncState === 'pending'" @click="syncToServer">
        {{ syncState === 'pending' ? t('learning.syncing') : t('learning.sync') }}
      </button>
      <p v-if="syncState === 'error'" class="fail">{{ t('learning.syncFailed') }} {{ syncError }}</p>
      <button v-if="syncState === 'error'" @click="syncToServer">{{ t('learning.syncRetry') }}</button>
    </section>
    <p class="disclaimer">{{ report.disclaimer }}</p>
    <label><input v-model="instructor" type="checkbox" /> {{ t('learning.instructor') }}</label>
    <section v-if="instructor"><b>{{ t('learning.expectedObserved') }}</b><p>{{ t('learning.expected') }}: {{ expectedActions.join(', ') || t('learning.none') }}</p><p>{{ t('learning.observed') }}: {{ report.observedActions.join(', ') || t('learning.none') }}</p><button @click="$emit('reset-scenario')">{{ t('learning.reset') }}</button></section>
  </aside>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { createLearningReport, renderLearningReportHtml, type AssessmentAuthority } from '../learning/report'
import { syncTrainingRun, trainingSyncConfigured, TrainingSyncError } from '../learning/trainingSessionApi'
import type { TimelineEntry } from '../timeline'
import { useSimulatorI18n } from '../i18n/simulator'
const props = defineProps<{ entries: readonly TimelineEntry[]; expectedActions: readonly string[]; scenarioId?: string }>()
defineEmits<{ 'reset-scenario': [] }>()
const alias = ref('')
const instructor = ref(false)
const { t } = useSimulatorI18n()
const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:learning', { x: 16, y: Math.max(16, window.innerHeight - 230) })
const report = computed(() => createLearningReport(props.entries, alias.value, props.expectedActions))
const authority = ref<AssessmentAuthority>('local')
const serverScore = ref<{ score: number; possibleScore: number } | null>(null)
const syncState = ref<'idle' | 'pending' | 'error'>('idle')
const syncError = ref('')
const syncConfigured = trainingSyncConfigured()
async function syncToServer(): Promise<void> {
  if (!syncConfigured || syncState.value === 'pending') return
  syncState.value = 'pending'
  syncError.value = ''
  try {
    const result = await syncTrainingRun({
      scenarioId: props.scenarioId ?? 'unknown-scenario',
      alias: report.value.sessionAlias,
      expectedActions: props.expectedActions,
      observedActions: report.value.observedActions,
      completed: report.value.metrics.scenarioCompleted,
    })
    authority.value = 'server'
    serverScore.value = { score: result.score, possibleScore: result.possibleScore }
    syncState.value = 'idle'
  } catch (error) {
    // The local report is always kept; a failed sync is explicit and retryable.
    syncState.value = 'error'
    syncError.value = error instanceof TrainingSyncError ? error.message : String(error)
  }
}
function download(name: string, type: string, content: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url) }
function exportJson(): void { download('fabrik3d-learning-report.json', 'application/json', JSON.stringify({ ...report.value, assessmentAuthority: authority.value }, null, 2)) }
function exportHtml(): void { download('fabrik3d-learning-report.html', 'text/html', renderLearningReportHtml({ ...report.value, assessmentAuthority: authority.value })) }
</script>
<style scoped>
.report-panel{z-index:20;max-width:23rem;padding:.8rem;background:#142535;color:#fff;border:2px solid #58b4d9}.drag-handle{display:block;cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}.report-panel label,.report-panel button{margin:.25rem}.report-panel ul{padding-left:1.2rem;font-size:.78rem}.pass{color:#95d5a2}.fail{color:#ffb4a2}.report-panel section{margin-top:.4rem;padding-top:.4rem;border-top:1px solid #607d8b;font-size:.8rem}.authority{font-size:.78rem;margin:.2rem 0}.authority.server b{color:#95d5a2}.authority.local b{color:#ffd48a}.disclaimer{font-size:.68rem;color:#9fb3c8;margin:.3rem 0}
</style>
