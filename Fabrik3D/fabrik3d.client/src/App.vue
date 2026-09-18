<script setup lang="ts">
import { ref } from 'vue'
import SingleConveyorCellLayout from './components/SingleConveyorCellLayout.vue'
import CellEditor from './components/CellEditor.vue'
import { createDefaultRobotCatalog } from './robot/catalog'

type ShellMode = 'execution' | 'editing'

const catalog = createDefaultRobotCatalog()
const mode = ref<ShellMode>('execution')

function setMode(next: ShellMode): void {
  // Explicit mode transition: switching away from execution unmounts the
  // running scene, so editing can never mutate an active scenario.
  mode.value = next
}
</script>

<template>
  <div class="app-shell">
    <div class="mode-bar" data-mode-bar>
      <button
        type="button"
        class="mode-button"
        :class="{ active: mode === 'execution' }"
        data-mode="execution"
        @click="setMode('execution')"
      >Run</button>
      <button
        type="button"
        class="mode-button"
        :class="{ active: mode === 'editing' }"
        data-mode="editing"
        @click="setMode('editing')"
      >Edit cell</button>
    </div>
    <SingleConveyorCellLayout v-if="mode === 'execution'" />
    <CellEditor v-else :robot-catalog="catalog" />
  </div>
</template>

<style scoped>
.app-shell { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.mode-bar {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  gap: 0.3rem;
  background: rgb(10 22 31 / 92%);
  border: 1px solid #2c718b;
  border-radius: 0.4rem;
  padding: 0.25rem;
  font: 0.72rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.mode-button {
  padding: 0.3rem 0.9rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: #9fc4d2;
  cursor: pointer;
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mode-button.active { background: #00cc88; color: #06201a; font-weight: 700; }
</style>