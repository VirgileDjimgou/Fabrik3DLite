<template>
  <aside class="simulation-dock" :class="`simulation-dock--${side}`" :data-dock="side">
    <button
      type="button"
      class="dock-rail"
      :aria-expanded="open"
      :aria-controls="contentId"
      @click="open = !open"
    >
      <span class="dock-rail__icon" aria-hidden="true">{{ open ? closeGlyph : openGlyph }}</span>
      <span>{{ label }}</span>
    </button>
    <section v-show="open" :id="contentId" class="dock-content">
      <slot />
    </section>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  side: 'left' | 'right' | 'bottom'
  label: string
  initialOpen?: boolean
}>(), { initialOpen: true })

const open = ref(props.initialOpen)
const contentId = `simulation-dock-${props.side}`
const openGlyph = props.side === 'left' ? '›' : props.side === 'right' ? '‹' : '▲'
const closeGlyph = props.side === 'left' ? '‹' : props.side === 'right' ? '›' : '▼'
const reset = (): void => { open.value = props.initialOpen }

onMounted(() => window.addEventListener('fabrik3d:reset-floating-panels', reset))
onBeforeUnmount(() => window.removeEventListener('fabrik3d:reset-floating-panels', reset))
</script>

<style scoped>
.simulation-dock {
  position: fixed;
  z-index: 40;
  display: flex;
  pointer-events: none;
  font: .75rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.simulation-dock--left { top: 3.8rem; bottom: 1rem; left: 0; flex-direction: row; align-items: flex-start; }
.simulation-dock--right { top: 3.8rem; bottom: 1rem; right: 0; flex-direction: row-reverse; align-items: flex-start; }
.simulation-dock--bottom { bottom: 0; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; align-items: center; }
.dock-rail {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: .45rem;
  border: 1px solid #34758a;
  background: rgb(10 22 31 / 96%);
  color: #b9eaff;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  letter-spacing: .04em;
  box-shadow: 0 .35rem 1rem rgb(0 0 0 / 28%);
}
.dock-rail:hover { border-color: #00cc88; color: #fff; }
.dock-rail__icon { color: #00cc88; font-size: 1.1rem; line-height: 1; }
.simulation-dock--left .dock-rail { writing-mode: vertical-rl; padding: .75rem .45rem; border-radius: 0 .45rem .45rem 0; }
.simulation-dock--left .dock-rail__icon { transform: rotate(90deg); }
.simulation-dock--right .dock-rail { writing-mode: vertical-rl; padding: .75rem .45rem; border-radius: .45rem 0 0 .45rem; }
.simulation-dock--right .dock-rail__icon { transform: rotate(90deg); }
.simulation-dock--bottom .dock-rail { padding: .35rem .85rem; border-radius: .45rem .45rem 0 0; }
.dock-content {
  pointer-events: auto;
  width: min(19.5rem, calc(100vw - 3rem));
  max-height: calc(100vh - 5rem);
  overflow: auto;
  padding: .45rem;
  background: rgb(6 16 24 / 88%);
  border: 1px solid rgb(52 117 138 / 78%);
  box-shadow: 0 .45rem 1.4rem rgb(0 0 0 / 32%);
}
.simulation-dock--left .dock-content { border-left: 0; border-radius: 0 .45rem .45rem 0; }
.simulation-dock--right .dock-content { border-right: 0; border-radius: .45rem 0 0 .45rem; }
.simulation-dock--bottom .dock-content {
  display: grid;
  grid-template-columns: repeat(2, minmax(18rem, 1fr));
  width: min(52rem, calc(100vw - 2rem));
  max-height: min(20rem, calc(100vh - 7rem));
  border-bottom: 0;
  border-radius: .45rem .45rem 0 0;
}
:deep(.dock-panel) { margin: 0; border: 1px solid rgb(96 164 184 / 35%); background: rgb(8 24 35 / 78%); }
:deep(.dock-panel + .dock-panel) { margin-top: .45rem; }
.simulation-dock--bottom :deep(.dock-panel + .dock-panel) { margin-top: 0; }
:deep(.dock-panel > summary) { cursor: pointer; padding: .42rem .55rem; color: #b9eaff; font-weight: 800; list-style: none; }
:deep(.dock-panel > summary::-webkit-details-marker) { display: none; }
:deep(.dock-panel > summary::before) { content: '›'; display: inline-block; margin-right: .45rem; color: #00cc88; font-size: 1rem; transition: transform .15s ease; }
:deep(.dock-panel[open] > summary::before) { transform: rotate(90deg); }
:deep(.docked-panel) {
  position: static !important;
  inset: auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
:deep(.docked-panel .drag-handle) { display: none !important; }
@media (max-width: 760px) {
  .simulation-dock--bottom .dock-content { grid-template-columns: 1fr; width: min(24rem, calc(100vw - 1rem)); }
  .simulation-dock--bottom :deep(.dock-panel + .dock-panel) { margin-top: .45rem; }
}
</style>
