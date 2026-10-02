<template>
  <div data-testid="job-composer">
    <h5 class="hmi-page-title mb-3"><i class="bi bi-plus-square hmi-icon me-2"></i>{{ t('newJob.title') }}</h5>

    <!-- Loading / offline / empty states -->
    <div v-if="loading" class="hmi-detail" role="status" data-testid="composer-loading">{{ t('newJob.validating') }}</div>

    <HmiEmptyState v-else-if="loadError"
      :title="offline ? t('newJob.offline') : t('newJob.loadOptionsFailed')"
      :detail="loadError">
      <button class="btn btn-hmi mt-2" type="button" data-testid="composer-retry" @click="loadOptions">
        <i class="bi bi-arrow-repeat me-1"></i>{{ t('newJob.retry') }}</button>
    </HmiEmptyState>

    <HmiEmptyState v-else-if="!options || options.cells.length === 0"
      :title="t('newJob.noCells')" :detail="t('newJob.loadOptionsFailed')" />

    <template v-else>
      <!-- Staged progress: numbered steps make the current position explicit. -->
      <ol class="hmi-steps mb-3" data-testid="composer-steps">
        <li v-for="s in steps" :key="s.n" class="hmi-step" :class="{ 'hmi-step--active': step === s.n }"
          :aria-current="step === s.n ? 'step' : undefined" :data-testid="`composer-step-${s.n}`">
          <span class="hmi-step__index">{{ s.n }}</span>
          <span>{{ t(s.label) }}</span>
        </li>
      </ol>

      <!-- Target-cell visibility: the operator always sees which cell the job will run on. -->
      <div class="hmi-status-strip mb-3" data-testid="composer-target-strip">
        <div class="hmi-metric flex-grow-1">
          <span class="hmi-label">{{ t('newJob.targetCellLabel') }}</span>
          <span class="hmi-value hmi-truncate" data-testid="composer-target-cell">{{ selectedCell?.name ?? '-' }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('newJob.scenarioLabel') }}</span>
          <span class="hmi-value hmi-truncate" data-testid="composer-target-scenario">{{ scenarioName }}</span>
        </div>
        <div class="hmi-metric">
          <span class="hmi-label">{{ t('newJob.occupiedSlots') }}</span>
          <span class="hmi-value" data-testid="composer-target-slots">{{ occupied.size }}</span>
        </div>
      </div>

      <!-- Step 1: identity and target -->
      <div v-if="step === 1" class="card" data-testid="composer-identity">
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label" for="composer-name">{{ t('jobs.name') }}</label>
            <input id="composer-name" v-model="form.name" type="text" class="form-control"
              :placeholder="t('newJob.namePlaceholder')" data-testid="composer-name" required />
          </div>
          <div class="mb-3">
            <label class="form-label" for="composer-description">{{ t('jobs.description') }}</label>
            <textarea id="composer-description" v-model="form.description" class="form-control" rows="2"
              :placeholder="t('newJob.descriptionPlaceholder')" data-testid="composer-description"></textarea>
          </div>
          <div class="row">
            <div class="col-md-4 mb-3">
              <label class="form-label" for="composer-mode">{{ t('newJob.machineModeLabel') }}</label>
              <select id="composer-mode" v-model="form.machineMode" class="form-select" data-testid="composer-mode">
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
                <option value="Setup">Setup</option>
              </select>
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label" for="composer-cell">{{ t('newJob.targetCellLabel') }}</label>
              <select id="composer-cell" v-model="form.targetCellId" class="form-select" data-testid="composer-cell">
                <option v-for="cell in options.cells" :key="cell.id" :value="cell.id">
                  {{ cell.name }}{{ cell.available ? '' : ' — ' + t('newJob.offline') }}
                </option>
              </select>
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label" for="composer-priority">{{ t('newJob.priorityLabel') }}</label>
              <input id="composer-priority" v-model.number="form.priority" type="number" min="0" max="9"
                class="form-control" data-testid="composer-priority" />
              <div class="form-text">{{ t('newJob.priorityHint') }}</div>
            </div>
          </div>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label" for="composer-scenario">{{ t('newJob.scenarioLabel') }}</label>
              <select id="composer-scenario" v-model="form.scenarioId" class="form-select" data-testid="composer-scenario">
                <option value="">{{ t('newJob.noTemplate') }}</option>
                <option v-for="sc in compatibleScenarios" :key="sc.id" :value="sc.id">{{ sc.name }}</option>
              </select>
              <div v-if="compatibleScenarios.length === 0" class="form-text text-warning" data-testid="composer-incompatible">
                {{ t('newJob.incompatible') }}</div>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label" for="composer-template">{{ t('newJob.cellTemplateLabel') }}</label>
              <select id="composer-template" v-model="form.cellTemplateId" class="form-select" data-testid="composer-template">
                <option value="">{{ t('newJob.noTemplate') }}</option>
                <option v-for="tp in options.cellTemplates" :key="tp.id" :value="tp.id">{{ tp.name }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: pallet and deterministic tasks -->
      <div v-else-if="step === 2" class="card" data-testid="composer-pallet">
        <div class="card-body">
          <div class="row">
            <div class="col-md-3 mb-3">
              <label class="form-label" for="composer-pallet-id">{{ t('newJob.palletIdLabel') }}</label>
              <input id="composer-pallet-id" v-model="form.palletId" type="text" class="form-control"
                data-testid="composer-pallet-id" />
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label" for="composer-rows">{{ t('newJob.rowsLabel') }}</label>
              <input id="composer-rows" v-model.number="form.rows" type="number" min="1" :max="options.maxRows"
                class="form-control" data-testid="composer-rows" />
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label" for="composer-columns">{{ t('newJob.columnsLabel') }}</label>
              <input id="composer-columns" v-model.number="form.columns" type="number" min="1" :max="options.maxColumns"
                class="form-control" data-testid="composer-columns" />
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label" for="composer-part">{{ t('newJob.partTypeLabel') }}</label>
              <input id="composer-part" v-model="form.partType" type="text" class="form-control"
                data-testid="composer-part" />
            </div>
          </div>

          <fieldset class="mb-3">
            <legend class="hmi-section-title mb-1">{{ t('newJob.occupiedSlots') }}</legend>
            <p class="hmi-detail">{{ t('newJob.slotGridHelp') }}</p>
            <div class="hmi-slot-grid" role="group" :aria-label="t('newJob.occupiedSlots')" data-testid="composer-grid">
              <button v-for="slot in allSlots" :key="slot.key" type="button"
                class="hmi-slot"
                :aria-pressed="occupied.has(slot.key)"
                :aria-label="`R${slot.row} C${slot.column}`"
                :data-testid="`composer-slot-${slot.row}-${slot.column}`"
                @click="toggleSlot(slot.row, slot.column)">
                R{{ slot.row }} C{{ slot.column }}
              </button>
            </div>
            <div v-if="occupied.size === 0" class="form-text text-warning" data-testid="composer-no-slots">
              {{ t('newJob.noSlots') }}</div>
          </fieldset>

          <div v-if="localTasks.length > 0">
            <h6 class="hmi-section-title mb-2">{{ t('newJob.generatedTasks') }}</h6>
            <div class="table-responsive">
              <table class="table table-sm align-middle" data-testid="composer-local-tasks">
                <thead><tr>
                  <th>{{ t('newJob.taskSeq') }}</th><th>{{ t('newJob.taskName') }}</th>
                  <th>{{ t('newJob.taskSlot') }}</th><th>{{ t('newJob.taskPart') }}</th>
                </tr></thead>
                <tbody>
                  <tr v-for="task in localTasks" :key="task.key">
                    <td>{{ task.seq }}</td><td>{{ task.name }}</td>
                    <td>R{{ task.row }} C{{ task.column }}</td><td>{{ task.partType }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: server-validated review -->
      <div v-else class="hmi-card" data-testid="composer-review">
        <div class="hmi-card__header"><span>{{ t('newJob.reviewTitle') }}</span></div>
        <div class="hmi-card__body">
          <div class="row small mb-3">
            <div class="col-md-4"><strong>{{ t('newJob.stepIdentity') }}:</strong> {{ form.name }}</div>
            <div class="col-md-4"><strong>{{ t('newJob.targetConfirm') }}:</strong>
              <span class="hmi-mono" data-testid="composer-review-target">{{ form.targetCellId }}</span></div>
            <div class="col-md-4"><strong>{{ t('newJob.reviewMode') }}:</strong> {{ form.machineMode }}</div>
            <div class="col-md-4 mt-1"><strong>{{ t('newJob.reviewPriority') }}:</strong> {{ form.priority }}</div>
            <div class="col-md-4 mt-1"><strong>{{ t('newJob.reviewScenario') }}:</strong> {{ form.scenarioId || '-' }}</div>
            <div class="col-md-4 mt-1"><strong>{{ t('newJob.reviewPallet') }}:</strong>
              {{ form.palletId }} ({{ form.rows }}x{{ form.columns }})</div>
          </div>

          <div v-if="previewLoading" class="hmi-detail" role="status" data-testid="composer-preview-loading">
            {{ t('newJob.validating') }}</div>

          <HmiErrorState v-else-if="previewError" :title="t('newJob.offline')" :detail="previewError" />

          <HmiErrorState v-else-if="preview && !preview.valid" :title="t('newJob.invalid')" :detail="errorText" />

          <template v-else-if="preview">
            <p class="text-success small" data-testid="composer-valid"><i class="bi bi-check-circle me-1"></i>{{ t('newJob.valid') }}</p>
            <div v-if="preview.warnings.length" class="alert alert-warning py-2 small" data-testid="composer-warnings">
              <strong>{{ t('newJob.warnings') }}:</strong>
              <ul class="mb-0"><li v-for="(w, wi) in preview.warnings" :key="wi">{{ w.message }}</li></ul>
            </div>
            <h6 class="hmi-section-title mb-2">{{ t('newJob.reviewTasks') }} ({{ preview.taskCount }})</h6>
            <div class="table-responsive">
              <table class="table table-sm align-middle" data-testid="composer-tasks">
                <thead><tr>
                  <th>{{ t('newJob.taskSeq') }}</th><th>{{ t('newJob.taskName') }}</th>
                  <th>{{ t('newJob.taskSlot') }}</th><th>{{ t('newJob.taskPart') }}</th>
                </tr></thead>
                <tbody>
                  <tr v-for="task in preview.tasks" :key="task.stableKey">
                    <td>{{ task.sequenceOrder }}</td><td>{{ task.name }}</td>
                    <td>R{{ task.slotRow }} C{{ task.slotColumn }}</td><td>{{ task.partType }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <HmiErrorState v-if="submitError" :title="t('newJob.submitFailed')" :detail="submitError" />

          <div v-if="createdJob" class="alert alert-success mt-2 mb-0" data-testid="composer-success">
            {{ t('newJob.success') }}
            <router-link class="alert-link ms-1" data-testid="composer-open-job"
              :to="{ name: 'currentJob', query: { job: createdJob.id } }">
              {{ t('newJob.createdLink') }}</router-link>
            <span class="font-monospace ms-2 small">{{ createdJob.id }}</span>
          </div>
        </div>
      </div>

      <!-- Navigation: touch-sized targets, primary action last in reading order. -->
      <div class="d-flex flex-wrap gap-2 mt-3" data-testid="composer-nav">
        <button v-if="step > 1" type="button" class="btn btn-outline-secondary" data-testid="composer-previous"
          :disabled="submitting" @click="goPrevious">
          <i class="bi bi-arrow-left me-1"></i>{{ t('newJob.previous') }}</button>
        <button v-if="step < 3" type="button" class="btn btn-hmi" data-testid="composer-next"
          :disabled="!canProceed" @click="goNext">
          <i class="bi bi-arrow-right me-1"></i>{{ t('newJob.next') }}</button>
        <button v-if="step === 3" type="button" class="btn btn-hmi" data-testid="composer-submit"
          :disabled="submitting || previewLoading || !preview || !preview.valid || !!createdJob" @click="submit">
          <i class="bi bi-check-lg me-1"></i>{{ submitting ? t('newJob.submitting') : t('newJob.submit') }}</button>
        <router-link to="/jobs" class="btn btn-outline-secondary">
          <i class="bi bi-x-lg me-1"></i>{{ t('nav.back') }}</router-link>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import { OrchestratorApiError } from '@fabrik3d/contracts'
import type { CreateJobRequest, JobComposerOptionsDto, JobComposerPreviewDto, JobDto } from '@/services/api'
import HmiEmptyState from '@/components/controls/HmiEmptyState.vue'
import HmiErrorState from '@/components/controls/HmiErrorState.vue'

const { t } = useI18n()

const steps = [
  { n: 1, label: 'newJob.stepIdentity' },
  { n: 2, label: 'newJob.stepPallet' },
  { n: 3, label: 'newJob.stepReview' },
] as const

const loading = ref(true)
const loadError = ref('')
const offline = ref(false)
const options = ref<JobComposerOptionsDto | null>(null)
const step = ref<1 | 2 | 3>(1)

const form = reactive({
  name: '',
  description: '',
  machineMode: 'Automatic',
  targetCellId: '',
  scenarioId: '',
  cellTemplateId: '',
  priority: 0,
  partType: 'part',
  palletId: 'pallet-1',
  rows: 2,
  columns: 2,
})

const occupied = reactive(new Set<string>())
const preview = ref<JobComposerPreviewDto | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
const submitting = ref(false)
const submitError = ref('')
const createdJob = ref<JobDto | null>(null)

const selectedCell = computed(() => options.value?.cells.find(c => c.id === form.targetCellId) ?? null)

const scenarioName = computed(() => {
  if (!form.scenarioId) return t('newJob.noTemplate')
  return options.value?.scenarios.find(s => s.id === form.scenarioId)?.name ?? form.scenarioId
})

const compatibleScenarios = computed(() => {
  if (!options.value) return []
  const cell = selectedCell.value
  if (!cell) return options.value.scenarios
  const compatible = cell.compatibleScenarioIds ?? []
  return options.value.scenarios.filter(s => s.id !== undefined && compatible.includes(s.id))
})

const allSlots = computed(() => {
  const rows = clamp(form.rows, 1, options.value?.maxRows ?? 32)
  const columns = clamp(form.columns, 1, options.value?.maxColumns ?? 32)
  const slots: { key: string; row: number; column: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) slots.push({ key: `${r}:${c}`, row: r, column: c })
  }
  return slots
})

const localTasks = computed(() =>
  allSlots.value
    .filter(s => occupied.has(s.key))
    .map((s, index) => ({
      key: s.key, seq: index, name: `R${s.row} C${s.column}`,
      row: s.row, column: s.column, partType: form.partType || 'part',
    })))

const canProceed = computed(() => {
  if (step.value === 1) return form.name.trim().length > 0 && form.targetCellId.length > 0
  if (step.value === 2) return form.rows >= 1 && form.columns >= 1 && occupied.size > 0
  return false
})

const errorText = computed(() =>
  (preview.value?.errors ?? []).map(e => `${e.field}: ${e.message}`).join(' · '))

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.floor(value), min), max)
}

function toggleSlot(row: number, column: number) {
  const key = `${row}:${column}`
  if (occupied.has(key)) occupied.delete(key)
  else occupied.add(key)
  preview.value = null
  createdJob.value = null
}

function occupiedSlots() {
  return [...occupied].map(key => {
    const [row, column] = key.split(':').map(Number)
    return { row, column }
  })
}

async function loadOptions() {
  loading.value = true
  loadError.value = ''
  offline.value = false
  try {
    options.value = await api.getJobComposerOptions()
    form.targetCellId = selectedCell.value?.id ?? options.value.cells[0]?.id ?? ''
    form.scenarioId = options.value.cells.find(c => c.id === form.targetCellId)?.defaultScenarioId ?? ''
    form.rows = Math.min(form.rows, options.value.maxRows)
    form.columns = Math.min(form.columns, options.value.maxColumns)
  } catch (e) {
    options.value = null
    offline.value = !(e instanceof OrchestratorApiError) || e.status === 0
    loadError.value = e instanceof Error ? e.message : t('newJob.loadOptionsFailed')
  } finally {
    loading.value = false
  }
}

function goNext() {
  if (!canProceed.value) return
  if (step.value === 1) { step.value = 2; return }
  if (step.value === 2) { step.value = 3; void validatePreview() }
}

function goPrevious() {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2 | 3
}

function buildRequest(): CreateJobRequest {
  const request: CreateJobRequest = {
    name: form.name.trim(),
    description: form.description,
    machineMode: form.machineMode,
    targetCellId: form.targetCellId,
    priority: form.priority,
    partType: form.partType || 'part',
    scenarioId: form.scenarioId || null,
    cellTemplateId: form.cellTemplateId || null,
    palletLayout: { palletId: form.palletId, rows: clamp(form.rows, 1, 32), columns: clamp(form.columns, 1, 32) },
    occupiedSlots: occupiedSlots(),
  }
  return request
}

async function validatePreview() {
  previewLoading.value = true
  previewError.value = ''
  submitError.value = ''
  try {
    preview.value = await api.previewJobDefinition(buildRequest())
  } catch (e) {
    preview.value = null
    previewError.value = e instanceof Error ? e.message : t('newJob.offline')
  } finally {
    previewLoading.value = false
  }
}

async function submit() {
  if (!preview.value?.valid || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    createdJob.value = await api.createComposerJob(buildRequest())
    // The server is the sole source of progress/lifecycle; refresh its authoritative preview.
    await validatePreview()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : t('newJob.submitFailed')
  } finally {
    submitting.value = false
  }
}

// Changing the target cell may invalidate the previously selected scenario.
watch(() => form.targetCellId, () => {
  if (form.scenarioId && !compatibleScenarios.value.some(s => s.id === form.scenarioId)) {
    form.scenarioId = ''
  }
  preview.value = null
  createdJob.value = null
})

onMounted(() => { void loadOptions() })
</script>
