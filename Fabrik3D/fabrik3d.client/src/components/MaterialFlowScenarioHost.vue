<template>
  <section class="host" data-material-flow-host>
    <ThreeScene>
      <ScenarioRuntimeScene
        ref="runtime"
        :binding="binding"
        @state="onState"
        @bound="onBound"
        @motion="onMotion"
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
      <span
        data-robot-motion
        :data-robot-phase="robot?.phase ?? ''"
        :data-robot-started="String(robot?.started ?? false)"
        :data-robot-complete="String(robot?.complete ?? false)"
        :data-robot-blocked="String(robot?.blocked ?? false)"
        :data-robot-block-reason="robot?.blockReason ?? ''"
        :data-robot-carrying="String(robot?.carrying ?? false)"
        :data-robot-joints="robotJointSignature"
      >
        Robot · {{ robot?.phase ?? '—' }}
        <template v-if="robot?.blocked"> · mouvement inhibé ({{ robot.blockReason }})</template>
      </span>
      <span
        v-if="capturePlan"
        data-execution-stage
        :data-execution-scenario="capturePlan.scenarioId"
        :data-execution-stage-count="capturePlan.stageCount"
        :data-execution-stage-id="processStageId ?? ''"
        :data-execution-stage-index="processStageIndex"
        :data-execution-stage-fault="String(processFaulted)"
        :data-execution-stage-reached="String(captureReached ?? false)"
        :data-execution-stage-sequence="capturePlan.targets.map(target => target.stageId).join(',')"
      >
        Exécution · {{ processStageId ?? '—' }} ({{ processStageIndex + 1 }}/{{ capturePlan.stageCount }})
      </span>
      <div class="camera-views" data-camera-views>
        <button
          v-for="view in cameraViews"
          :key="view.id"
          type="button"
          :data-camera-view="view.id"
          :class="{ active: cameraView === view.id }"
          @click="selectCameraView(view.id)"
        >{{ view.label }}</button>
      </div>
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
import {
  buildScenarioStageCapturePlan,
  resolveStageCaptureTarget,
  type ScenarioStageCapturePlan,
} from '../scenarios/scenarioStageCapture'
import type { CellVisualState } from '../scenarios/cellVisualState'
import type { ScenarioRobotMotionSnapshot } from '../scenarios/ScenarioRobotMotionAdapter'
import type { SceneCameraView } from '../scenes/types'

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
const robot = ref<ScenarioRobotMotionSnapshot | null>(null)
const robotJointSignature = computed(() => (robot.value?.jointAngles ?? []).map(value => value.toFixed(3)).join(','))
const sessionId = ref(`sim-${props.preset.id}-0`)
const runtime = ref<InstanceType<typeof ScenarioRuntimeScene> | null>(null)
const scenarioTitle = computed(() => binding.value.scenario?.title.fr ?? props.preset.name.fr)

// S71: deterministic execution-stage capture. When the page is opened with an
// explicit `?stage=<stageId>` query parameter, the host drives the *existing*
// S67 guided process to that declared stage so a capture shows real execution
// rather than an idle cell. This reuses the process API already exposed by
// `ScenarioRuntimeScene`; it adds no new timeline engine and never mutates
// scenario truth outside the authoritative process driver.
const capturePlan = ref<ScenarioStageCapturePlan | null>(null)
const processStageId = ref<string | null>(null)
const processStageIndex = ref(-1)
const processFaulted = ref(false)
const captureReached = ref<boolean | null>(null)

function requestedStageId(): string | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('stage')
  return value && value.trim() ? value.trim() : null
}

/**
 * Drives the bound scenario to the requested declared stage using guided
 * process steps. Returns true when the target was reached; false when the
 * scenario has no process, the stage id is unknown, or the process paused on a
 * fault before the target (the caller then fails closed rather than capturing
 * an arbitrary frame).
 */
function driveToRequestedStage(): boolean {
  const target = requestedStageId()
  if (!target) return false
  const definition = runtime.value?.getProcessDefinition() ?? null
  if (!definition) return false
  const plan = buildScenarioStageCapturePlan(definition)
  capturePlan.value = plan
  const resolved = resolveStageCaptureTarget(plan, target)
  if (!resolved) return false

  runtime.value?.startScenarioProcess({ continuous: false })
  // The S67 driver's `step()` completes the stage currently in progress and
  // rests on the next one, so the *visible* stage is the last emitted stage
  // (`CellVisualState.processStageId`), not the snapshot's next-stage id. Step
  // until the visible stage matches the target, bounded by the declared stage
  // count so an unknown state can never loop forever.
  const maxSteps = plan.stageCount + 1
  for (let step = 0; step < maxSteps; step += 1) {
    const snapshot = runtime.value?.stepScenarioProcess() ?? null
    if (!snapshot) return false
    const visibleStage = runtime.value?.getVisualState().processStageId ?? null
    processStageId.value = visibleStage
    processStageIndex.value = visibleStage ? plan.targets.findIndex(item => item.stageId === visibleStage) : -1
    processFaulted.value = snapshot.faulted
    if (visibleStage === target) {
      visual.value = runtime.value?.getVisualState() ?? visual.value
      return true
    }
    // A guided process pauses on a declared fault stage; acknowledge it so the
    // remaining declared stages (including the recovery point) can be reached.
    if (snapshot.phase === 'awaiting-recovery') {
      runtime.value?.acknowledgeScenarioFault()
    }
  }
  visual.value = runtime.value?.getVisualState() ?? visual.value
  return false
}

// S69: derived camera views. Overview is the primary default; operator and
// workcell are secondary framings derived from the same measured scene data.
const cameraViews: ReadonlyArray<{ id: SceneCameraView, label: string }> = [
  { id: 'overview', label: 'Vue d’ensemble' },
  { id: 'operator', label: 'Opérateur' },
  { id: 'workcell', label: 'Cellule' },
]
const cameraView = ref<SceneCameraView>('overview')

function selectCameraView(view: SceneCameraView): void {
  cameraView.value = view
  runtime.value?.setCameraView(view)
}

function onState(next: ScenarioProgress): void {
  state.value = next
  visual.value = runtime.value?.getVisualState() ?? visual.value
}

function onBound(next: ScenarioRuntimeMetrics): void {
  metrics.value = next
  // S71: after the visuals are bound, drive the deterministic execution-stage
  // capture when one was requested. A failure to reach the requested stage is
  // surfaced as an explicit diagnostic attribute so a capture can fail closed.
  if (requestedStageId()) {
    const reached = driveToRequestedStage()
    captureReached.value = reached
  }
}

function onMotion(next: ScenarioRobotMotionSnapshot | null): void {
  robot.value = next
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
.camera-views { display: flex; gap: .25rem; }
.camera-views button { flex: 1; background: transparent; color: #b9eaff; }
.camera-views button.active { background: #00cc88; color: #06201a; font-weight: 700; }
</style>
