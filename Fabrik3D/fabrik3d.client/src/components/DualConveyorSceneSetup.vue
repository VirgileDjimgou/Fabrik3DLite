<template>
  <!-- Renderless – camera, lights, helpers for the dual-conveyor scene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { DUAL_CELL_CAMERA } from '../simulation/DualCellLayout'

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let axesHelper: THREE.AxesHelper | null = null
let cellGrid: THREE.GridHelper | null = null

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx) return

    const cam = DUAL_CELL_CAMERA

    // ── Camera – elevated front view showing both conveyors + CNC ─
    ctx.camera.position.set(...cam.position)
    ctx.camera.lookAt(...cam.target)
    ctx.controls.target.set(...cam.target)
    ctx.controls.update()

    // ── Shadow coverage ──────────────────────────────────────────
    ctx.scene.traverse((child) => {
      if (child instanceof THREE.DirectionalLight && child.castShadow) {
        child.position.set(6, 14, -6)
        child.shadow.camera.left = -12
        child.shadow.camera.right = 12
        child.shadow.camera.top = 12
        child.shadow.camera.bottom = -12
        child.shadow.camera.far = 40
        child.shadow.camera.updateProjectionMatrix()
        child.shadow.mapSize.set(2048, 2048)
      }
    })

    // ── Debug helpers ────────────────────────────────────────────
    axesHelper = new THREE.AxesHelper(1.0)
    axesHelper.position.set(0, 0.01, 0)
    ctx.addObject(axesHelper)

    cellGrid = new THREE.GridHelper(20, 40, 0x444466, 0x333355)
    cellGrid.position.y = 0.002
    ctx.addObject(cellGrid)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx) {
    if (axesHelper) ctx.removeObject(axesHelper)
    if (cellGrid) ctx.removeObject(cellGrid)
  }
  axesHelper = null
  cellGrid = null
})
</script>
