<template>
  <aside class="editor-catalog-panel" :style="panelStyle" aria-label="Equipment catalog">
    <header class="drag-handle" @pointerdown="beginDrag"><span aria-hidden="true">⠿</span> <strong>Equipment</strong></header>
    <p class="hint">Click to place on the grid.</p>
    <section v-for="group in groups" :key="group.name" :data-catalog-group="group.name">
      <h4>{{ group.name }}</h4>
      <ul>
        <li v-for="entry in group.entries" :key="entry.kind">
          <button type="button" :data-kind="entry.kind" @click="$emit('insert', entry.kind)">
            <span>{{ entry.label }}</span><small v-if="entry.capability === 'static'">layout</small>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditorCatalogEntry } from '../editor/editorTypes'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'

const props = defineProps<{
  entries: EditorCatalogEntry[]
}>()

const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:editor-catalog', { x: 16, y: 58 })
const groups = computed(() => {
  const order = ['Core equipment', 'Material flow', 'Tooling', 'Safety', 'Infrastructure'] as const
  return order.map(name => ({ name, entries: props.entries.filter(entry => (entry.group ?? 'Core equipment') === name) })).filter(group => group.entries.length)
})

defineEmits<{
  (e: 'insert', kind: EditorCatalogEntry['kind']): void
}>()
</script>

<style scoped>
.editor-catalog-panel {
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
.hint { margin: 0.25rem 0 0.4rem; color: #7ea6b5; }
section + section { margin-top: .55rem; padding-top: .45rem; border-top: 1px solid rgb(120 170 188 / 20%); }
h4 { margin: 0 0 .28rem; color: #f7c948; font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
li button {
  width: 100%;
  padding: 0.35rem 0.5rem;
  text-align: left;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(120 170 188 / 30%);
  border-radius: 4px;
  color: #dbe7ee;
  cursor: pointer;
  font: inherit;
}
li button { display: flex; justify-content: space-between; gap: .4rem; }
small { color: #9fc4d2; text-transform: uppercase; font-size: .6rem; }
li button:hover { background: rgb(0 200 120 / 18%); border-color: #00cc88; }
</style>
