<template>
  <!-- Renderless – adds a single metal part mesh to the scene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { createPartGeometry, type PartShape } from '../simulation/PartManager'

const STEEL_COLOR = 0x8a8a8a
const MACHINED_COLOR = 0xb0c4de

const props = defineProps<{
  partId: string
  shape: PartShape
  initialPosition: [number, number, number]
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let mesh: THREE.Mesh | null = null

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || mesh) return

    const geo = createPartGeometry(props.shape)
    const mat = new THREE.MeshStandardMaterial({
      color: STEEL_COLOR,
      metalness: 0.8,
      roughness: 0.3,
    })
    mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(...props.initialPosition)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = props.partId
    ctx.addObject(mesh)
  },
  { immediate: true },
)

/** Remove the part visually (picked by robot gripper). */
function pick(): void {
  if (!mesh) return
  mesh.visible = false
}

/** Place the part at a new world position. */
function place(x: number, y: number, z: number): void {
  if (!mesh) return
  mesh.position.set(x, y, z)
  mesh.visible = true
}

/** Change appearance to indicate the part has been machined. */
function markAsMachined(): void {
  if (!mesh) return
  const mat = mesh.material
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.color.set(MACHINED_COLOR)
    mat.metalness = 0.9
    mat.roughness = 0.15
  }
}

defineExpose({ pick, place, markAsMachined })

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && mesh) ctx.removeObject(mesh)
  if (mesh) {
    mesh.geometry.dispose()
    const mat = mesh.material
    if (mat instanceof THREE.Material) mat.dispose()
  }
  mesh = null
})
</script>
