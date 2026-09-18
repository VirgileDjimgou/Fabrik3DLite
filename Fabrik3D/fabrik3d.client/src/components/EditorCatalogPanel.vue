<template>
  <aside class="editor-catalog-panel" aria-label="Equipment catalog">
    <header><strong>Equipment</strong></header>
    <p class="hint">Click to place on the grid.</p>
    <ul>
      <li v-for="entry in entries" :key="entry.kind">
        <button type="button" :data-kind="entry.kind" @click="$emit('insert', entry.kind)">
          {{ entry.label }}
        </button>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import type { EditorCatalogEntry } from '../editor/editorTypes'

defineProps<{
  entries: EditorCatalogEntry[]
}>()

defineEmits<{
  (e: 'insert', kind: EditorCatalogEntry['kind']): void
}>()
</script>

<style scoped>
.editor-catalog-panel {
  position: absolute;
  top: 1rem;
  left: 1rem;
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
.hint { margin: 0.25rem 0 0.4rem; color: #7ea6b5; }
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
li button:hover { background: rgb(0 200 120 / 18%); border-color: #00cc88; }
</style>