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
import type { CellVisualState } from '../scenarios/cellVisualState'
import type { ScenarioSceneBinding } from '../scenarios/sceneBinding'
import type { ScenarioProgress } from '../scenarios/types'

const props = defineProps<{ binding: ScenarioSceneBinding }>()
const emit = defineEmits<{
  (event: 'state', state: ScenarioProgress): void
  (event: 'bound', metrics: ScenarioRuntimeMetrics): void
}>()

const context = inject<ShallowRef<ThreeSceneContext | null> | null>(SCENE_CONTEXT_KEY, null)
const animationLoop = inject<AnimationLoopApi | null>(ANIMATION_LOOP_KEY, null)
const injectedRuntime = inject(ASSET_RUNTIME_KEY, null)
const assetRuntime = injectedRuntime ?? createDefaultEquipmentAssetRuntime()
const host = new ScenarioRuntimeHost({ assetRuntime })
let attached = false

function placeCamera(): void {
  const ctx = context?.value
  if (!ctx) return
  const target = host.placeCamera(ctx.camera)
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
  // states pushed in by authoritative scenario events.
  animationLoop?.onFrame((_time, delta) => host.tick(delta))
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
  getState: (): ScenarioProgress => host.progress(),
  getMetrics: (): ScenarioRuntimeMetrics => host.metrics(),
  getVisualState: (): CellVisualState => host.visualState,
  getVisualSnapshot: (): ScenarioCellSnapshot | null => host.visualSnapshot(),
})
</script>
