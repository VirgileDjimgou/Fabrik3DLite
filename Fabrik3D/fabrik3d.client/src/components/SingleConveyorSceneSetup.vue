<template>
  <!-- Renderless – camera, lights, grid for the single-conveyor cell -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { SINGLE_CELL_CAMERA } from '../simulation/SingleConveyorCellLayout'
import { SINGLE_CONVEYOR_CELL } from '../equipment/fixtures/singleConveyorCell'
import { cellFootprints } from '../scenes/cellFootprints'
import { resolveCellLayout } from '../scenes/cellLayout'
import type { SceneCameraView } from '../scenes/types'

const props = withDefaults(defineProps<{ cameraView?: SceneCameraView }>(), { cameraView: 'overview' })

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let axesHelper: THREE.AxesHelper | null = null
let cellGrid: THREE.GridHelper | null = null

// S69: the CNC reference cell's camera views are derived from the same measured
// layout as the scene preset. The legacy constant remains the documented
// fallback if the derived framing is unavailable.
const CNC_CAMERAS = resolveCellLayout({ footprints: cellFootprints(SINGLE_CONVEYOR_CELL) }).cameras

function applyCamera(ctx: NonNullable<typeof sceneCtx.value>): void {
  const cam = CNC_CAMERAS[props.cameraView] ?? SINGLE_CELL_CAMERA
  ctx.camera.position.set(cam.position.x, cam.position.y, cam.position.z)
  ctx.camera.lookAt(cam.target.x, cam.target.y, cam.target.z)
  ctx.controls.target.set(cam.target.x, cam.target.y, cam.target.z)
  ctx.controls.update()
}

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx) return

    applyCamera(ctx)

    // ── Shadow coverage ──────────────────────────────────────────
    ctx.scene.traverse((child) => {
      if (child instanceof THREE.DirectionalLight && child.castShadow) {
        child.position.set(6, 12, -4)
        child.shadow.camera.left = -9
        child.shadow.camera.right = 9
        child.shadow.camera.top = 9
        child.shadow.camera.bottom = -9
        child.shadow.camera.far = 35
        child.shadow.camera.updateProjectionMatrix()
        const mapSize = ctx.quality === 'high' ? 4096 : ctx.quality === 'low' ? 512 : 2048
        child.shadow.mapSize.set(mapSize, mapSize)
      }
    })

    // ── Debug helpers ────────────────────────────────────────────
    axesHelper = new THREE.AxesHelper(1.0)
    axesHelper.position.set(0, 0.01, 0)
    ctx.addObject(axesHelper)

    cellGrid = new THREE.GridHelper(18, 36, 0x444466, 0x333355)
    cellGrid.position.y = 0.002
    ctx.addObject(cellGrid)
  },
  { immediate: true },
)

watch(
  () => props.cameraView,
  () => {
    const ctx = sceneCtx.value
    if (ctx) applyCamera(ctx)
  },
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
