<template>
  <!-- Renderless: the scenario host owns and mounts the Three.js scene graph. -->
  <span style="display: none" aria-hidden="true" />
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, watch } from 'vue'
import type { ShallowRef } from 'vue'
import type { ThreeSceneContext } from '../composables/useThreeScene'
import { ASSET_RUNTIME_KEY, ANIMATION_LOOP_KEY, SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import type { AnimationLoopApi } from '../composables/injectionKeys'
import { createDefaultEquipmentAssetRuntime } from '../equipment/assets'
import { ScenarioRuntimeHost, type ScenarioRuntimeMetrics } from '../scenarios/ScenarioRuntimeHost'
import type { ScenarioCellSnapshot } from '../scenarios/ScenarioCellAnimator'
import type { ScenarioRobotMotionSnapshot } from '../scenarios/ScenarioRobotMotionAdapter'
import type { ScenarioProcessDefinition, ScenarioProcessSnapshot } from '../scenarios/scenarioProcess'
import type { CellVisualState } from '../scenarios/cellVisualState'
import type { ScenarioSceneBinding } from '../scenarios/sceneBinding'
import type { ScenarioProgress } from '../scenarios/types'
import type { SceneCameraView } from '../scenes/types'

const props = defineProps<{ binding: ScenarioSceneBinding }>()
const emit = defineEmits<{
  (event: 'state', state: ScenarioProgress): void
  (event: 'bound', metrics: ScenarioRuntimeMetrics): void
  (event: 'motion', snapshot: ScenarioRobotMotionSnapshot | null): void
}>()

const context = inject<ShallowRef<ThreeSceneContext | null> | null>(SCENE_CONTEXT_KEY, null)
const animationLoop = inject<AnimationLoopApi | null>(ANIMATION_LOOP_KEY, null)
const injectedRuntime = inject(ASSET_RUNTIME_KEY, null)
const assetRuntime = injectedRuntime ?? createDefaultEquipmentAssetRuntime()
const host = new ScenarioRuntimeHost({ assetRuntime })
let attached = false
let cameraView: SceneCameraView = 'overview'

function placeCamera(): void {
  const ctx = context?.value
  if (!ctx) return
  const target = host.placeCamera(ctx.camera, cameraView)
  ctx.controls.target.set(target.x, target.y, target.z)
  ctx.controls.update()
}

function attachToScene(): void {
  const ctx = context?.value
  if (ctx && !attached) {
    ctx.addObject(host.root)
    attached = true
  }
  placeCamera()
}

async function load(): Promise<void> {
  const metrics = await host.loadVisuals()
  attachToScene()
  emit('bound', metrics)
}

onMounted(() => {
  emit('state', host.bind(props.binding))
  void load()
  // The animator's deterministic transition clock is render-only and never
  // mutates scenario state; it only interpolates the visible motion between
  // states pushed in by authoritative scenario events. Robot motion is sampled
  // and surfaced (throttled) for the operator overlay; it is never authoritative.
  let motionEmitAccumulator = 0
  let lastMotionSignature = ''
  animationLoop?.onFrame((_time, delta) => {
    host.tick(delta)
    motionEmitAccumulator += delta
    const snapshot = host.robotSnapshot()
    const signature = snapshot
      ? `${snapshot.phase}|${snapshot.blocked}|${snapshot.blockReason}|${snapshot.carrying}|${snapshot.complete}`
      : ''
    if (signature !== lastMotionSignature || motionEmitAccumulator >= 0.1) {
      lastMotionSignature = signature
      motionEmitAccumulator = 0
      emit('motion', snapshot)
    }
  })
})

watch(
  () => context?.value,
  (ctx) => { if (ctx) attachToScene() },
)

watch(
  () => props.binding,
  async (binding) => {
    emit('state', host.bind(binding))
    const metrics = await host.switch(binding)
    attachToScene()
    emit('bound', metrics)
  },
)

onBeforeUnmount(() => {
  context?.value?.removeObject(host.root)
  host.dispose()
  if (!injectedRuntime) void assetRuntime.disposeAll()
})

defineExpose({
  runScenario: (): ScenarioProgress => {
    const state = host.run()
    host.tick(0)
    emit('state', state)
    return state
  },
  recoverScenario: (): ScenarioProgress => {
    const state = host.recover()
    host.tick(0)
    emit('state', state)
    return state
  },
  startScenarioProcess: (options?: { continuous?: boolean }): ScenarioProcessSnapshot | null => {
    const snapshot = host.startProcess(options)
    emit('state', host.progress())
    return snapshot
  },
  stepScenarioProcess: (): ScenarioProcessSnapshot | null => {
    const snapshot = host.stepProcess()
    host.tick(0)
    emit('state', host.progress())
    return snapshot
  },
  pauseScenarioProcess: (): ScenarioProcessSnapshot | null => host.pauseProcess(),
  resumeScenarioProcess: (): ScenarioProcessSnapshot | null => host.resumeProcess(),
  acknowledgeScenarioFault: (): ScenarioProcessSnapshot | null => {
    const snapshot = host.acknowledgeProcessFault()
    host.tick(0)
    emit('state', host.progress())
    return snapshot
  },
  getProcessSnapshot: (): ScenarioProcessSnapshot | null => host.processState,
  /** S71: the bound scenario's declared process definition, or null. */
  getProcessDefinition: (): ScenarioProcessDefinition | null => host.process,
  getState: (): ScenarioProgress => host.progress(),
  getMetrics: (): ScenarioRuntimeMetrics => host.metrics(),
  getVisualState: (): CellVisualState => host.visualState,
  getVisualSnapshot: (): ScenarioCellSnapshot | null => host.visualSnapshot(),
  getRobotSnapshot: (): ScenarioRobotMotionSnapshot | null => host.robotSnapshot(),
  /** S69: applies a derived camera view (overview/operator/workcell). */
  setCameraView: (view: SceneCameraView): void => {
    cameraView = view
    placeCamera()
  },
  getCameraView: (): SceneCameraView => cameraView,
})
</script>
