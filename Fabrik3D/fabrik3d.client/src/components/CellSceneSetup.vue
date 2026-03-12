<template>
  <!-- Renderless – configures camera, debug helpers, shadow coverage, and machine orientations -->
</template>

<script setup lang="ts">
import { inject, watch, nextTick, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let axesHelper: THREE.AxesHelper | null = null
let cellGrid: THREE.GridHelper | null = null

watch(
  () => sceneCtx.value,
  async (ctx) => {
    if (!ctx) return

    // ── Camera – observe the entire cell ──────────────────────────
    ctx.camera.position.set(6, 4, 6)
    ctx.camera.lookAt(0, 1, 0)
    ctx.controls.target.set(0, 1, 0)
    ctx.controls.update()

    // ── Shadow coverage – expand the directional-light frustum ────
    ctx.scene.traverse((child) => {
      if (child instanceof THREE.DirectionalLight && child.castShadow) {
        child.position.set(6, 10, 6)
        child.shadow.camera.left = -8
        child.shadow.camera.right = 8
        child.shadow.camera.top = 8
        child.shadow.camera.bottom = -8
        child.shadow.camera.far = 30
        child.shadow.camera.updateProjectionMatrix()
        child.shadow.mapSize.set(2048, 2048)
      }
    })

    // ── Debug helpers ─────────────────────────────────────────────
    axesHelper = new THREE.AxesHelper(1.5)
    axesHelper.position.set(0, 0.01, 0)
    ctx.addObject(axesHelper)

    // Larger grid that covers the full cell footprint
    cellGrid = new THREE.GridHelper(16, 32, 0x444466, 0x333355)
    cellGrid.position.set(1, 0.003, 0) // offset so grid centres on the cell
    ctx.addObject(cellGrid)

    // ── Wait for sibling components to finish adding objects ──────
    await nextTick()

    // Rotate the CNC machine so its door (local +Z) faces the robot (−X)
    const cncGroup = ctx.scene.getObjectByName('CNCMachine')
    if (cncGroup) {
      cncGroup.rotation.y = -Math.PI / 2
    }
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
