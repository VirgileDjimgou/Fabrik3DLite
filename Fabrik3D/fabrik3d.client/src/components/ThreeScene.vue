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
import { ref, onMounted, provide } from 'vue'
import { useThreeScene } from '../composables/useThreeScene'
import { useAnimationLoop } from '../composables/useAnimationLoop'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'

const containerRef = ref<HTMLDivElement | null>(null)
const { context, errorMessage, init } = useThreeScene(containerRef)
const { onFrame, start } = useAnimationLoop()

// Let child components register into the scene / animation loop
provide(SCENE_CONTEXT_KEY, context)
provide(ANIMATION_LOOP_KEY, { onFrame })

onMounted(() => {
  init()

  if (context.value) {
    // Drive controls + render each frame
    onFrame(() => {
      const ctx = context.value
      if (!ctx) return
      ctx.controls.update()
      ctx.renderer.render(ctx.scene, ctx.camera)
    })
    start()
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
