<template>
  <aside class="editor-property-panel" :style="panelStyle" aria-label="Selected equipment properties">
    <header class="drag-handle" @pointerdown="beginDrag"><span aria-hidden="true">⠿</span> <strong>Properties</strong></header>

    <template v-if="placement">
      <p class="title">{{ placement.label }}</p>
      <div class="row"><label>X (m)</label><input type="number" step="0.1" :value="placement.x.toFixed(3)" data-field="x" @change="onField('x', $event)" /></div>
      <div class="row"><label>Z (m)</label><input type="number" step="0.1" :value="placement.z.toFixed(3)" data-field="z" @change="onField('z', $event)" /></div>
      <div class="row"><label>Rotation (°)</label><input type="number" step="15" :value="degrees(placement.rotationRad).toFixed(1)" data-field="rotation" @change="onField('rotation', $event)" /></div>
      <div class="row"><label>Size</label><span class="value">{{ placement.width.toFixed(2) }} × {{ placement.depth.toFixed(2) }} m</span></div>
      <div v-if="placement.reachMeters" class="row"><label>Reach</label><span class="value">{{ placement.reachMeters.toFixed(2) }} m</span></div>

      <div v-if="invalid" class="warning" role="alert" data-invalid-indicator>
        Invalid placement: overlaps another element.
      </div>

      <button type="button" class="delete" data-action="delete" @click="$emit('delete')">Remove</button>
    </template>

    <p v-else class="none">No element selected.</p>
  </aside>
</template>

<script setup lang="ts">
import type { EditorPlacement } from '../editor/editorTypes'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'

const props = defineProps<{
  placement: EditorPlacement | null
  invalid: boolean
}>()

const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:editor-properties', { x: Math.max(16, window.innerWidth - 224), y: 58 })

const emit = defineEmits<{
  (e: 'update', field: 'x' | 'z' | 'rotation', value: number): void
  (e: 'delete'): void
}>()

function degrees(radians: number): number { return (radians * 180) / Math.PI }

function onField(field: 'x' | 'z' | 'rotation', event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(raw)) emit('update', field, raw)
}
</script>

<style scoped>
.editor-property-panel {
  z-index: 20;
  width: 13rem;
  background: rgb(10 22 31 / 94%);
  color: #e5edf2;
  border: 1px solid #2c718b;
  border-radius: 0.35rem;
  padding: 0.6rem 0.8rem;
  font: 0.72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
header { color: #b9eaff; }
.drag-handle { cursor: grab; user-select: none; }
.drag-handle:active { cursor: grabbing; }
.title { margin: 0.3rem 0; color: #9fc4d2; }
.row { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.2rem 0; align-items: center; }
.row label { color: #82c9df; }
.row input { width: 5rem; background: rgb(255 255 255 / 8%); color: #fff; border: 1px solid rgb(120 170 188 / 35%); border-radius: 3px; padding: 0.15rem 0.3rem; font: inherit; }
.value { color: #fff; }
.warning { margin: 0.4rem 0; padding: 0.35rem; border: 1px solid #ff7a6b; color: #ffb3a9; background: rgb(255 90 70 / 12%); border-radius: 4px; }
.delete { margin-top: 0.4rem; width: 100%; padding: 0.35rem; background: rgb(200 60 50 / 25%); border: 1px solid #ff7a6b; border-radius: 4px; color: #ffb3a9; cursor: pointer; font: inherit; }
.delete:hover { background: rgb(200 60 50 / 45%); }
.none { color: #7ea6b5; }
</style>
