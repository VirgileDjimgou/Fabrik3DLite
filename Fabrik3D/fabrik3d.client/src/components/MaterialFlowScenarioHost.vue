<template>
  <section class="host" data-material-flow-host>
    <SceneLayoutPreview :preset="preset" />
    <aside class="runtime" :data-runtime-state="state.status">
      <strong>{{ scenario.title.fr }}</strong>
      <small>SIMULATED DATA — session {{ sessionId }}</small>
      <span>État : {{ state.status }} · {{ state.progressPercent }}%</span>
      <span v-if="state.currentActivityId">Étape : {{ state.currentActivityId }}</span>
      <button type="button" data-action="run-material-flow" @click="run">Lancer le scénario</button>
      <button type="button" data-action="recover-material-flow" :disabled="state.status !== 'running'" @click="recover">Acquitter / récupération</button>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ScenePreset } from '../scenes'
import { getScenario, ScenarioRunner, type ScenarioProgress } from '../scenarios'
import SceneLayoutPreview from './SceneLayoutPreview.vue'

const props = defineProps<{ preset: ScenePreset }>()
const scenario = ref(getScenario(props.preset.defaultScenarioId!))
const runner = ref(new ScenarioRunner(scenario.value))
const state = ref<ScenarioProgress>(runner.value.getState())
const sessionId = ref(`sim-${props.preset.id}-0`)

watch(() => props.preset.id, () => {
  scenario.value = getScenario(props.preset.defaultScenarioId!)
  runner.value = new ScenarioRunner(scenario.value)
  state.value = runner.value.getState()
  sessionId.value = `sim-${props.preset.id}-0`
})

function run(): void {
  state.value = runner.value.start()
  state.value = runner.value.observe({ type: 'scenario.ready' })
  // The process event is deliberately deterministic and runtime data remains explicit.
  state.value = runner.value.observe({ type: scenario.value.activities[1]!.expectedEvent!.type })
  sessionId.value = `sim-${props.preset.id}-${state.value.scenarioId}`
}
function recover(): void { state.value = runner.value.observe({ type: 'scenario.recovered' }) }
</script>

<style scoped>
.host { position: relative; width: 100%; height: 100%; }
.runtime { position: absolute; z-index: 5; right: 1rem; top: 4rem; display: grid; gap: .35rem; width: 17rem; padding: .7rem; border: 1px solid #34758a; border-radius: .4rem; background: rgb(10 22 31 / 94%); color: #dce9ee; font: .72rem/1.3 ui-monospace, monospace; }
.runtime small { color: #ffd166; }.runtime button { padding: .35rem; border: 1px solid #34758a; border-radius: .25rem; background: #075f48; color: #fff; cursor: pointer; font: inherit; }.runtime button:disabled { opacity: .45; cursor: not-allowed; }
</style>
