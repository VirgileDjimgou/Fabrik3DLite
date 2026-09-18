<template>
  <div class="cell-editor" data-view="cell-editor">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <span class="mode">EDITOR</span>
      <button type="button" data-action="undo" :disabled="!state.canUndo" @click="undo">Undo</button>
      <button type="button" data-action="redo" :disabled="!state.canRedo" @click="redo">Redo</button>
      <button type="button" data-action="reset" @click="reset">Reset to reference</button>
      <label class="snap-toggle">
        <input type="checkbox" v-model="state.snap" /> Snap to grid
      </label>

      <span class="toolbar-sep"></span>
      <select v-model="sampleRobotId" data-sample-select>
        <option v-for="id in SAMPLE_ROBOT_IDS" :key="id" :value="id">{{ id }}</option>
      </select>
      <button type="button" data-action="load-sample" @click="loadSample">Load sample</button>
      <button type="button" data-action="import" @click="fileInput?.click()">Import</button>
      <button type="button" data-action="export" @click="exportFile">Export</button>
      <button type="button" data-action="validate" @click="runValidation">Validate</button>
      <button type="button" data-action="save" @click="saveToOrchestrator">Save</button>
      <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" data-file-input @change="onImportFile" />

      <span v-if="state.invalidCount" class="invalid-count" data-invalid-count>{{ state.invalidCount }} invalid overlap(s)</span>
    </div>

    <!-- Diagnostics strip -->
    <div v-if="state.diagnostics.length" class="diagnostics" data-diagnostics>
      <span v-for="(d, i) in state.diagnostics" :key="i" class="diagnostic" :class="d.severity" :data-severity="d.severity">
        {{ d.severity.toUpperCase() }}: {{ d.message }}
      </span>
      <span v-if="state.validationClean" class="diagnostic ok" data-validation-ok>VALID: schema 1.0, no errors.</span>
    </div>
    <div v-else-if="state.validationClean" class="diagnostics" data-diagnostics>
      <span class="diagnostic ok" data-validation-ok>VALID: schema 1.0, no errors.</span>
    </div>

    <!-- Save feedback -->
    <div v-if="state.saveMessage" class="save-message" data-save-message>{{ state.saveMessage }}</div>

    <!-- Plan canvas -->
    <svg
      ref="canvasRef"
      class="editor-canvas"
      viewBox="0 0 12 12"
      data-canvas
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointerleave="drag = null"
    >
      <!-- grid -->
      <g class="grid">
        <line v-for="x in gridLines" :key="'gx' + x" :x1="x" :y1="0" :x2="x" :y2="12" />
        <line v-for="z in gridLines" :key="'gz' + z" :x1="0" :y1="z" :x2="12" :y2="z" />
      </g>

      <!-- reach circles -->
      <g v-for="p in state.placements" :key="'reach-' + p.id">
        <circle
          v-if="p.reachMeters"
          :cx="worldX(p.x)" :cy="worldZ(p.z)" :r="p.reachMeters"
          class="reach" :data-reach="p.id"
        />
      </g>

      <!-- equipment bounds -->
      <g v-for="p in state.placements" :key="p.id">
        <g :transform="placementTransform(p)">
          <rect
            :x="worldX(p.x) - p.width / 2" :y="worldZ(p.z) - p.depth / 2"
            :width="p.width" :height="p.depth"
            rx="0.15"
            class="bounds"
            :class="{
              selected: p.id === state.selectionId,
              invalid: isInvalid(p.id),
            }"
            :data-placement="p.id"
            :data-kind="p.kind"
            :data-x="p.x"
            :data-z="p.z"
            :data-rotation="p.rotationRad"
            @pointerdown.stop="beginDrag(p.id, $event)"
          />
          <text :x="worldX(p.x)" :y="worldZ(p.z)" class="placement-label">{{ p.label }}</text>
        </g>
      </g>

      <!-- frames (axes) at each placement -->
      <g v-for="p in state.placements" :key="'frame-' + p.id">
        <g :transform="placementTransform(p)">
          <line :x1="worldX(p.x)" :y1="worldZ(p.z)" :x2="worldX(p.x) + 0.4" :y2="worldZ(p.z)" class="axis-x" />
          <line :x1="worldX(p.x)" :y1="worldZ(p.z)" :x2="worldX(p.x)" :y2="worldZ(p.z) + 0.4" class="axis-z" />
        </g>
      </g>
    </svg>

    <EditorCatalogPanel :entries="catalog" @insert="insert" />
    <EditorPropertyPanel
      :placement="selectedPlacement"
      :invalid="selectedInvalid"
      @update="onPropertyUpdate"
      @delete="removeSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import EditorCatalogPanel from './EditorCatalogPanel.vue'
import EditorPropertyPanel from './EditorPropertyPanel.vue'
import type { RobotCatalogService } from '../robot/catalog'
import { CellEditorModel } from '../editor/cellEditorModel'
import { cellDefinitionToPlacements, createEditorCatalog } from '../editor/catalog'
import { buildReferencePlacements } from '../editor/referenceCell'
import { hasInvalidOverlap } from '../editor/overlap'
import type { EditorPlacement } from '../editor/editorTypes'
import {
  SAMPLE_CELLS,
  SAMPLE_ROBOT_IDS,
  type SampleRobotId,
} from '../cell-files/sampleCells'
import { parseCellFile, downloadCellFile, serializeCellFile, toCellFile, fromCellFile } from '../cell-files/importExport'
import { validateCellFile } from '../cell-files/validation'
import { CellFileError, type CellFileDiagnostic } from '../cell-files/diagnostics'
import * as api from '../services/orchestratorApi'

const props = defineProps<{
  robotCatalog: RobotCatalogService
}>()

const catalog = createEditorCatalog(props.robotCatalog)
const model = new CellEditorModel(catalog, buildReferencePlacements(catalog))

const state = reactive({
  placements: model.getPlacements(),
  selectionId: model.getSelectionId(),
  canUndo: model.canUndo(),
  canRedo: model.canRedo(),
  invalidCount: model.getOverlaps().filter((r) => r.invalid).length,
  snap: true,
  diagnostics: [] as CellFileDiagnostic[],
  validationClean: false,
  saveMessage: '',
})

const fileInput = ref<HTMLInputElement | null>(null)
const sampleRobotId = ref<SampleRobotId>('medium-6axis')

const knownDefinitionIds = computed(() => new Set([
  ...catalog.map((entry) => entry.definitionId),
  ...props.robotCatalog.listRobots().map((robot) => robot.id),
]))

const canvasRef = ref<SVGSVGElement | null>(null)
const drag = ref<{ id: string; x: number; z: number } | null>(null)

const WORLD_MIN = -6
const WORLD_MAX = 6
const SPAN = WORLD_MAX - WORLD_MIN

const gridLines = computed(() => {
  const lines: number[] = []
  for (let i = 1; i < 12; i++) lines.push(i)
  return lines
})

const selectedPlacement = computed(() => {
  return state.placements.find((p) => p.id === state.selectionId) ?? null
})

const selectedInvalid = computed(() => {
  if (!selectedPlacement.value) return false
  return isInvalid(selectedPlacement.value.id)
})

function worldX(x: number): number { return x - WORLD_MIN }
function worldZ(z: number): number { return WORLD_MAX - z }

function placementTransform(p: EditorPlacement): string {
  return `translate(${worldX(p.x)} ${worldZ(p.z)}) rotate(${degrees(p.rotationRad)}) translate(${-worldX(p.x)} ${-worldZ(p.z)})`
}

function isInvalid(id: string): boolean {
  return hasInvalidOverlap(id, state.placements)
}

function degrees(radians: number): number { return (radians * 180) / Math.PI }

function refresh(): void {
  state.placements = model.getPlacements()
  state.selectionId = model.getSelectionId()
  state.canUndo = model.canUndo()
  state.canRedo = model.canRedo()
  state.invalidCount = model.getOverlaps().filter((r) => r.invalid).length
}

function insert(kind: EditorPlacement['kind']): void {
  model.add(kind, 0, 0, state.snap)
  refresh()
}

function removeSelected(): void {
  if (state.selectionId) { model.remove(state.selectionId); refresh() }
}

function undo(): void { if (model.undo()) refresh() }
function redo(): void { if (model.redo()) refresh() }

function reset(): void { model.reset(); refresh() }

function onPropertyUpdate(field: 'x' | 'z' | 'rotation', value: number): void {
  if (!state.selectionId) return
  if (field === 'rotation') model.rotate(state.selectionId, (value * Math.PI) / 180, state.snap)
  else if (field === 'x') model.move(state.selectionId, value, model.getPlacement(state.selectionId)?.z ?? 0, state.snap)
  else if (field === 'z') model.move(state.selectionId, model.getPlacement(state.selectionId)?.x ?? 0, value, state.snap)
  refresh()
}

// ── Persistence toolbar actions ────────────────────────────────────

function currentCellFile() {
  return toCellFile(model.toCellDefinition())
}

function loadSample(): void {
  const sample = fromCellFile(SAMPLE_CELLS[sampleRobotId.value])
  const converted = cellDefinitionToPlacements(sample, catalog, props.robotCatalog)
  model.load(converted.placements)
  state.diagnostics = converted.skipped.length
    ? [{ severity: 'warning', code: 'skipped_equipment', message: `Skipped ${converted.skipped.length} unknown equipment entry/entries: ${converted.skipped.join(', ')}` }]
    : []
  state.validationClean = false
  state.saveMessage = ''
  refresh()
}

function exportFile(): void {
  downloadCellFile(currentCellFile(), `${currentCellFile().id}.cell.json`)
  state.saveMessage = 'Cell file exported locally.'
}

function onImportFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  void file.text().then((text) => {
    try {
      const { cell, migrated, diagnostics } = parseCellFile(text, knownDefinitionIds.value)
      const converted = cellDefinitionToPlacements(fromCellFile(cell), catalog, props.robotCatalog)
      model.load(converted.placements)
      state.diagnostics = [...diagnostics, ...(converted.skipped.length ? [{
        severity: 'warning' as const,
        code: 'skipped_equipment',
        message: `Skipped ${converted.skipped.length} unknown equipment entry/entries: ${converted.skipped.join(', ')}`,
      }] : [])]
      if (migrated) state.diagnostics.push({ severity: 'warning', code: 'migrated', message: 'Imported an older 0.9 cell file (migrated to 1.0).' })
      state.validationClean = false
      state.saveMessage = `Imported '${cell.name}'.`
      refresh()
    } catch (error) {
      if (error instanceof CellFileError) state.diagnostics = error.diagnostics
      else state.diagnostics = [{ severity: 'error', code: 'import_failed', message: 'Import failed.' }]
    }
    input.value = ''
  })
}

function runValidation(): void {
  const diagnostics = validateCellFile(currentCellFile(), knownDefinitionIds.value)
  state.diagnostics = diagnostics
  state.validationClean = diagnostics.every((d) => d.severity !== 'error')
}

async function saveToOrchestrator(): Promise<void> {
  const cell = currentCellFile()
  state.saveMessage = ''
  try {
    await api.saveCellTemplate({ name: cell.name, content: serializeCellFile(cell) })
    state.saveMessage = `Saved '${cell.name}' to the orchestrator.`
  } catch (error) {
    state.saveMessage = `Save failed: ${error instanceof Error ? error.message : 'unknown error'} (offline or rejected).`
  }
}

// ── Canvas interaction ─────────────────────────────────────────────

function pointerToWorld(event: PointerEvent): { x: number; z: number } {
  const svg = canvasRef.value!
  const rect = svg.getBoundingClientRect()
  // The viewBox (12×12) is letterboxed into the viewport ("meet"); compute
  // the actual scale and centering offsets.
  const scale = Math.min(rect.width / SPAN, rect.height / SPAN)
  const dx = (rect.width - SPAN * scale) / 2
  const dy = (rect.height - SPAN * scale) / 2
  return {
    x: (event.clientX - rect.left - dx) / scale + WORLD_MIN,
    z: WORLD_MAX - (event.clientY - rect.top - dy) / scale,
  }
}

function beginDrag(id: string, event: PointerEvent): void {
  model.select(id)
  const world = pointerToWorld(event)
  drag.value = { id, x: world.x, z: world.z }
  refresh()
}

function onCanvasPointerDown(event: PointerEvent): void {
  // Click on empty canvas: clear selection.
  if (!drag.value) model.select(null)
  refresh()
}

function onCanvasPointerMove(event: PointerEvent): void {
  if (!drag.value) return
  const world = pointerToWorld(event)
  const placement = model.getPlacement(drag.value.id)
  if (!placement) return
  drag.value = { id: drag.value.id, x: world.x, z: world.z }
  // Live draft preview (no history) while dragging.
  const target = model.getPlacements().map((p) => p.id === placement.id ? { ...p, x: world.x, z: world.z } : p)
  state.placements = target
}

function onCanvasPointerUp(): void {
  if (!drag.value) return
  // Commit one history entry for the drag at the released position.
  model.move(drag.value.id, drag.value.x, drag.value.z, state.snap)
  drag.value = null
  refresh()
}
</script>

<style scoped>
.cell-editor {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #0c1419;
  overflow: hidden;
}
.editor-toolbar {
  position: absolute;
  top: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  display: flex;
  gap: 0.4rem;
  align-items: center;
  background: rgb(10 22 31 / 94%);
  border: 1px solid #2c718b;
  border-radius: 0.35rem;
  padding: 0.4rem 0.7rem;
  font: 0.72rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #e5edf2;
}
.editor-toolbar button {
  padding: 0.25rem 0.55rem;
  background: rgb(255 255 255 / 8%);
  border: 1px solid rgb(120 170 188 / 35%);
  border-radius: 4px;
  color: #dbe7ee;
  cursor: pointer;
  font: inherit;
}
.editor-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.editor-toolbar button:hover:not(:disabled) { border-color: #00cc88; }
.mode { color: #f7c948; font-weight: 700; letter-spacing: 0.05em; }
.snap-toggle { display: flex; gap: 0.3rem; align-items: center; color: #9fc4d2; }
.invalid-count { color: #ff7a6b; font-weight: 700; }
.toolbar-sep { width: 1px; height: 1.1em; background: rgb(120 170 188 / 40%); }
.editor-toolbar select { background: rgb(255 255 255 / 8%); color: #dbe7ee; border: 1px solid rgb(120 170 188 / 35%); border-radius: 4px; font: inherit; }
.diagnostics {
  position: absolute;
  bottom: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: center;
  max-width: 80vw;
}
.diagnostic {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font: 0.7rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #e5edf2;
}
.diagnostic.error { background: rgb(255 90 70 / 20%); border: 1px solid #ff7a6b; color: #ffb3a9; }
.diagnostic.warning { background: rgb(255 200 90 / 18%); border: 1px solid #ffd166; color: #ffe3a1; }
.diagnostic.ok { background: rgb(0 200 120 / 16%); border: 1px solid #00cc88; color: #9ff0cf; }
.save-message {
  position: absolute;
  top: 3.2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  padding: 0.3rem 0.6rem;
  background: rgb(10 22 31 / 94%);
  border: 1px solid #2c718b;
  border-radius: 4px;
  color: #dbe7ee;
  font: 0.7rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.editor-canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
.grid line { stroke: rgb(120 170 188 / 10%); stroke-width: 0.02; pointer-events: none; }
.reach { fill: rgb(0 200 120 / 6%); stroke: rgb(0 200 120 / 40%); stroke-dasharray: 0.25 0.25; stroke-width: 0.03; pointer-events: none; }
.bounds { fill: rgb(90 140 170 / 30%); stroke: #4fa3c7; stroke-width: 0.05; cursor: grab; }
.bounds.selected { stroke: #00cc88; stroke-width: 0.08; fill: rgb(0 200 120 / 25%); }
.bounds.invalid { fill: rgb(255 90 70 / 35%); stroke: #ff7a6b; stroke-width: 0.08; stroke-dasharray: 0.3 0.2; }
.placement-label { fill: #e5edf2; font-size: 0.22px; text-anchor: middle; pointer-events: none; }
.axis-x { stroke: #ff7a6b; stroke-width: 0.05; pointer-events: none; }
.axis-z { stroke: #5aa7ff; stroke-width: 0.05; pointer-events: none; }
</style>