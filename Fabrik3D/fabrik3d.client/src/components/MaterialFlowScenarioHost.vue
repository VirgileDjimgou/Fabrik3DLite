<template>
  <section class="host" data-material-flow-host>
    <ThreeScene>
      <ScenarioRuntimeScene
        ref="runtime"
        :binding="binding"
        @state="onState"
        @bound="metrics = $event"
      />
    </ThreeScene>
    <aside class="runtime" :data-runtime-state="state.status">
      <strong>{{ scenarioTitle }}</strong>
      <small>SIMULATED DATA — session {{ sessionId }}</small>
      <span>État : {{ state.status }} · {{ state.progressPercent }}%</span>
      <span v-if="state.currentActivityId">Étape : {{ state.currentActivityId }}</span>
      <span data-scenario-runtime :data-runtime-equipment-count="metrics.equipmentCount">
        Cellule 3D · {{ metrics.equipmentCount }} équipements · {{ metrics.triangles }} triangles
      </span>
      <span
        data-cell-state
        :data-cell-kind="visual?.kind ?? ''"
        :data-cell-classification="visual?.classification ?? ''"
        :data-cell-jam="String(visual?.jam ?? false)"
        :data-cell-vacuum-loss="String(visual?.vacuumLoss ?? false)"
        :data-cell-gate-open="String(visual?.gateOpen ?? false)"
        :data-cell-emergency-stop="String(visual?.emergencyStop ?? false)"
        :data-cell-layers="visual?.layerPlaced ?? 0"
      >
        État cellule · {{ visual?.kind ?? '—' }} · {{ visual?.stackLight ?? '—' }}
        <template v-if="visual?.jam"> · bourrage</template>
        <template v-if="visual?.vacuumLoss"> · perte de vide</template>
        <template v-if="visual?.classification"> · {{ visual.classification === 'accepted' ? 'accepté' : 'rebut' }}</template>
      </span>
      <span v-if="binding.fallbackUsed" class="diagnostic" data-runtime-diagnostic>Profil visuel dérivé (repli)</span>
      <button type="button" data-action="run-material-flow" @click="run">Lancer le scénario</button>
      <button type="button" data-action="recover-material-flow" :disabled="state.status !== 'running'" @click="recover">Acquitter / récupération</button>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ThreeScene from './ThreeScene.vue'
import ScenarioRuntimeScene from './ScenarioRuntimeScene.vue'
import { createDefaultScenePresetCatalog, type ScenePreset } from '../scenes'
import { idleScenarioProgress, resolveScenarioSceneBinding, type ScenarioProgress, type ScenarioRuntimeMetrics } from '../scenarios'
import type { CellVisualState } from '../scenarios/cellVisualState'

const props = defineProps<{ preset: ScenePreset }>()

// One validated catalog per component; the binding is pure data resolution.
const catalog = createDefaultScenePresetCatalog()
const binding = computed(() => resolveScenarioSceneBinding(
  props.preset.defaultScenarioId ?? props.preset.compatibleScenarioIds[0]!,
  catalog,
))
const state = ref<ScenarioProgress>(idleScenarioProgress(binding.value.scenario, binding.value.scenarioId))
const metrics = ref<ScenarioRuntimeMetrics>({ equipmentCount: 0, meshes: 0, triangles: 0, drawCalls: 0, textures: 0, loadMs: 0 })
const visual = ref<CellVisualState | null>(null)
const sessionId = ref(`sim-${props.preset.id}-0`)
const runtime = ref<InstanceType<typeof ScenarioRuntimeScene> | null>(null)
const scenarioTitle = computed(() => binding.value.scenario?.title.fr ?? props.preset.name.fr)

function onState(next: ScenarioProgress): void {
  state.value = next
  visual.value = runtime.value?.getVisualState() ?? visual.value
}

function run(): void {
  runtime.value?.runScenario()
  visual.value = runtime.value?.getVisualState() ?? visual.value
  sessionId.value = `sim-${props.preset.id}-${state.value.scenarioId}`
}

function recover(): void {
  runtime.value?.recoverScenario()
  visual.value = runtime.value?.getVisualState() ?? visual.value
}

watch(() => props.preset.id, () => { sessionId.value = `sim-${props.preset.id}-0` })
</script>

<style scoped>
.host { position: relative; width: 100%; height: 100%; }
.runtime { position: absolute; z-index: 5; right: 1rem; top: 4rem; display: grid; gap: .35rem; width: 17rem; padding: .7rem; border: 1px solid #34758a; border-radius: .4rem; background: rgb(10 22 31 / 94%); color: #dce9ee; font: .72rem/1.3 ui-monospace, monospace; }
.runtime small { color: #ffd166; }
.runtime .diagnostic { color: #ffd166; }
.runtime button { padding: .35rem; border: 1px solid #34758a; border-radius: .25rem; background: #075f48; color: #fff; cursor: pointer; font: inherit; }
.runtime button:disabled { opacity: .45; cursor: not-allowed; }
</style>
