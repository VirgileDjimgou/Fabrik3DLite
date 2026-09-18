<template>
  <aside class="scene-selector" :style="panelStyle" aria-label="Scene catalog" data-scene-selector>
    <header class="drag-handle" @pointerdown="beginDrag"><span aria-hidden="true">⠿</span> Scenes</header>
    <label>
      <span>Predefined cell</span>
      <select :value="selectedId" data-scene-select @change="selectScene">
        <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name[locale] }}</option>
      </select>
    </label>
    <p class="purpose">{{ selected.purpose[locale] }}</p>
    <div class="meta">
      <span class="badge" :class="selected.capability" data-scene-capability>
        {{ selected.capability === 'simulation-ready' ? 'Simulation ready' : 'Layout only' }}
      </span>
      <span>{{ selected.compatibleScenarioIds.length }} scenarios</span>
    </div>
    <div v-if="defaultScenario" class="scenario-brief" data-scenario-brief>
      <strong>{{ defaultScenario.title[locale] }}</strong>
      <span>{{ complexity[defaultScenario.level] }}</span>
      <small v-if="defaultScenario.prerequisites.length">{{ prerequisitesLabel }}: {{ defaultScenario.prerequisites.join(', ') }}</small>
      <small class="simulated">SIMULATED DATA — training only</small>
    </div>
    <p v-if="selected.capability === 'layout-only'" class="notice" role="status">
      {{ layoutOnlyNotice[locale] }}
    </p>
    <button type="button" data-action="reset-scene" @click="$emit('reset')">Default scene</button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ScenePreset } from '../scenes'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { getScenario } from '../scenarios'

const props = withDefaults(defineProps<{
  presets: ScenePreset[]
  selectedId: string
  locale?: 'en' | 'fr' | 'de'
}>(), { locale: 'en' })

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'reset'): void
}>()

const selected = computed(() => props.presets.find(preset => preset.id === props.selectedId) ?? props.presets[0]!)
const defaultScenario = computed(() => selected.value.defaultScenarioId ? getScenario(selected.value.defaultScenarioId) : null)
const complexity = { beginner: 'Complexity: basic', intermediate: 'Complexity: standard', advanced: 'Complexity: advanced' }
const prerequisitesLabel = props.locale === 'fr' ? 'Prérequis' : props.locale === 'de' ? 'Voraussetzungen' : 'Prerequisites'
const layoutOnlyNotice = {
  en: 'Inspection only — simulation runtime will be added in a later sprint.',
  fr: 'Inspection uniquement — simulation indisponible avant l’ajout du runtime.',
  de: 'Nur Inspektion — die Simulationslaufzeit wird später ergänzt.',
}
const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:scene-selector', { x: Math.max(16, window.innerWidth / 2 - 180), y: 54 })

function selectScene(event: Event): void {
  emit('select', (event.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.scene-selector { z-index: 45; width: 22rem; padding: .65rem .75rem; border: 1px solid #34758a; border-radius: .4rem; background: rgb(10 22 31 / 94%); color: #e5edf2; box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 28%); font: .72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
header { color: #9de3f6; font-weight: 800; margin-bottom: .4rem; }
.drag-handle { cursor: grab; user-select: none; }
.drag-handle:active { cursor: grabbing; }
label span { display: block; color: #82c9df; margin-bottom: .2rem; }
select { width: 100%; padding: .35rem; border: 1px solid #456b79; border-radius: .25rem; background: #152a34; color: #fff; font: inherit; }
.purpose { margin: .45rem 0; color: #b8cdd5; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: .5rem; color: #8fa9b4; }
.badge { border: 1px solid currentColor; border-radius: 999px; padding: .12rem .45rem; font-weight: 800; text-transform: uppercase; }
.simulation-ready { color: #68dfa8; }
.layout-only { color: #ffd166; }
.notice { color: #ffd166; margin: .45rem 0; }
.scenario-brief { display: grid; gap: .15rem; margin-top: .45rem; padding: .4rem; border-left: 2px solid #00cc88; background: rgb(0 200 120 / 8%); color: #cce1e8; }
.scenario-brief strong { color: #fff; }
.scenario-brief small { color: #8fa9b4; }
.scenario-brief .simulated { color: #ffd166; font-weight: 700; }
button { margin-top: .5rem; padding: .3rem .55rem; border: 1px solid #34758a; border-radius: .25rem; background: transparent; color: #b9eaff; cursor: pointer; font: inherit; }
button:hover { border-color: #00cc88; color: #fff; }
</style>
