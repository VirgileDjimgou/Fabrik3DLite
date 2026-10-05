<template>
  <div ref="containerRef" class="three-scene">
    <div v-if="errorMessage" class="error-overlay">
      <h2>3D Rendering Error</h2>
      <p>{{ errorMessage }}</p>
      <p>Please make sure your browser supports WebGL and hardware acceleration is enabled.</p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, provide, inject, onBeforeUnmount } from 'vue'
import { useThreeScene } from '../composables/useThreeScene'
import { useAnimationLoop } from '../composables/useAnimationLoop'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY, ASSET_RUNTIME_KEY } from '../composables/injectionKeys'
import { FrameMetricsSampler, SimulatorMetricsReporter } from '../observability/frameMetrics'
import type { SimulatorFrameSummary } from '../observability/frameMetrics'
import type { RendererIdentity } from '../observability/acceleration'
import { estimateSceneTextureMemory } from '../equipment/assets/sceneMetrics'
import { createDefaultEquipmentAssetRuntime, sceneQualityToAssetProfile } from '../equipment/assets'
import { getAccessToken } from '../auth/authStore'

/** Read-only diagnostics surface for automated performance/soak harnesses (S56). No secrets. */
interface Fabrik3dDiagnostics {
  getSummary: () => SimulatorFrameSummary | null
  getRendererIdentity: () => RendererIdentity | null
  getQuality: () => string | null
  reset: () => void
}

function diagnosticsEnabled(): boolean {
  try {
    return import.meta.env.DEV || new URLSearchParams(window.location.search).has('diagnostics')
  } catch {
    return false
  }
}

const containerRef = ref<HTMLDivElement | null>(null)
const { context, errorMessage, init } = useThreeScene(containerRef)
const { onFrame, start } = useAnimationLoop()

// Local, bounded client performance instrumentation (S49). Reporting is off unless explicitly
// enabled with VITE_OBSERVABILITY_ENABLED=true and never affects rendering.
const frameSampler = new FrameMetricsSampler()
const diagnosticsOn = diagnosticsEnabled()
const metricsReporter = new SimulatorMetricsReporter({
  enabled: import.meta.env.VITE_OBSERVABILITY_ENABLED === 'true',
  baseUrl: (import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined) ?? window.location.origin,
  sourceId: 'simulator',
  intervalMs: 5000,
  getAccessToken,
})

// Let child components register into the scene / animation loop
// S54: one shared asset runtime owns the registry, loader, cache, LOD policy and diagnostics.
// An ancestor may provide a runtime (for example a deterministic test or a shared
// application-scoped runtime); otherwise this scene owns its default instance and
// disposes it on unmount.
const injectedAssetRuntime = inject(ASSET_RUNTIME_KEY, null)
const assetRuntime = injectedAssetRuntime ?? createDefaultEquipmentAssetRuntime()
const ownsAssetRuntime = injectedAssetRuntime === null
provide(SCENE_CONTEXT_KEY, context)
provide(ANIMATION_LOOP_KEY, { onFrame })
provide(ASSET_RUNTIME_KEY, assetRuntime)

onMounted(() => {
  init()
  assetRuntime.setQualityProfile(sceneQualityToAssetProfile(context.value?.quality ?? 'medium'))

  if (context.value) {
    // Classify acceleration from the observed renderer before sampling so results stay honest.
    frameSampler.setRendererIdentity(context.value.rendererIdentity)
    if (diagnosticsOn) {
      const diagnostics: Fabrik3dDiagnostics = {
        getSummary: () => frameSampler.summary(),
        getRendererIdentity: () => context.value?.rendererIdentity ?? null,
        getQuality: () => context.value?.quality ?? null,
        reset: () => frameSampler.reset(),
      }
      ;(window as typeof window & { __fabrik3dDiagnostics?: Fabrik3dDiagnostics }).__fabrik3dDiagnostics = diagnostics
    }
    // Drive controls + render each frame
    onFrame((_time, delta) => {
      const ctx = context.value
      if (!ctx) return
      ctx.controls.update()
      // S74: renders through the quality-gated composer when enabled, otherwise
      // the direct renderer.render path. The fallback is decided in useThreeScene.
      ctx.render()
      // With the composer active, `renderer.info.render` reflects the trailing
      // fullscreen pass; use the captured scene beauty-pass stats instead so the
      // frame metrics and GPU benchmark stay honest.
      const stats = ctx.postProcessing?.sceneRenderStats()
      frameSampler.record({
        frameMs: delta * 1000,
        drawCalls: stats ? stats.drawCalls : ctx.renderer.info.render.calls,
        triangles: stats ? stats.triangles : ctx.renderer.info.render.triangles,
      })
      // Scene resource sampling is needed by the reporter and by soak/performance harnesses.
      if (metricsReporter.enabled || diagnosticsOn) {
        const memory = estimateSceneTextureMemory(ctx.scene)
        frameSampler.recordResources({ textureBytes: memory.estimatedBytes, textureCount: memory.textureCount })
      }
      if (metricsReporter.enabled) {
        void metricsReporter.maybeReport(frameSampler)
      }
    })
    start()
  }
})

onBeforeUnmount(() => {
  // Children release their instances first; this frees any unreferenced cache entries.
  // Only dispose a runtime this scene created; an injected runtime outlives the scene.
  if (ownsAssetRuntime) void assetRuntime.disposeAll()
  if (diagnosticsOn) {
    delete (window as typeof window & { __fabrik3dDiagnostics?: Fabrik3dDiagnostics }).__fabrik3dDiagnostics
  }
})
</script>

<style scoped>
.three-scene {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  color: #f0f0f0;
  font-family: sans-serif;
  text-align: center;
  padding: 2rem;
  z-index: 10;
}

.error-overlay h2 {
  color: #ff6600;
  margin-bottom: 0.5rem;
}
</style>
