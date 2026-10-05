<template>
  <!-- Renderless – S55 hero-cell dressing (chip handling, buffers, work lights,
       cable drops, bollards). Render-only; never a collision authority. -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY, ASSET_RUNTIME_KEY } from '../composables/injectionKeys'
import { HERO_CELL_DRESSING_ASSET_ID, type AssetRuntimeInstance } from '../equipment'
import { buildHeroCellDressingFallback, disposeHeroCellDressing } from '../equipment/visuals/heroCellDressing'
import {
  applyEquipmentShadowFlags,
  applyEquipmentSurfaceTextures,
  createContactShadow,
  disposeContactShadow,
} from '../equipment/visuals/equipmentGrounding'

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const assetRuntime = inject(ASSET_RUNTIME_KEY)!

let root: THREE.Group | null = null
let loadedVisual: AssetRuntimeInstance | null = null
let contactShadow: THREE.Mesh | null = null
let usesProceduralFallback = false

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || root) return
    void mount(ctx)
  },
  { immediate: true },
)

async function mount(ctx: { addObject: (object: THREE.Object3D) => void, camera?: THREE.Camera }): Promise<void> {
  const instance = await assetRuntime.acquire(HERO_CELL_DRESSING_ASSET_ID, {
    proceduralFallback: buildHeroCellDressingFallback,
    distanceMeters: cameraDistance(ctx.camera),
  })
  if (root) {
    instance.dispose()
    return
  }
  loadedVisual = instance
  usesProceduralFallback = instance.source === 'procedural'
  root = instance.root as THREE.Group
  root.name = 'HeroCellDressing'
  // S72 grounding: shadows plus a floor decal anchor the render-only dressing.
  applyEquipmentShadowFlags(root)
  applyEquipmentSurfaceTextures(root)
  contactShadow = createContactShadow({ radius: 0.9, name: 'grounding:contact-shadow:dressing' })
  root.add(contactShadow)
  ctx.addObject(root)
}

function cameraDistance(camera?: THREE.Camera): number {
  if (!camera) return 0
  return camera.position.distanceTo(new THREE.Vector3(0, 0, 0))
}

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && root) ctx.removeObject(root)
  if (contactShadow) {
    disposeContactShadow(contactShadow)
    contactShadow = null
  }
  if (usesProceduralFallback && root) disposeHeroCellDressing(root)
  loadedVisual?.dispose()
  loadedVisual = null
  root = null
})
</script>
