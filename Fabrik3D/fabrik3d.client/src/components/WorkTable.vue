<template>
  <!-- Renderless – adds work table geometry to parent ThreeScene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
}>(), {
  position: () => [-2, 0, 0] as [number, number, number],
})

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let tableGroup: THREE.Group | null = null

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || tableGroup) return
    tableGroup = buildTable()
    tableGroup.position.set(...props.position)
    ctx.addObject(tableGroup)
  },
  { immediate: true },
)

function buildTable(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'WorkTable'

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    metalness: 0.7,
    roughness: 0.35,
  })
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x6a6a6a,
    metalness: 0.6,
    roughness: 0.4,
  })

  // Table top (1.2 × 0.8 m, 4 cm thick)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), topMat)
  top.position.y = 0.85
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  // Four legs
  const legGeo = new THREE.BoxGeometry(0.06, 0.83, 0.06)
  const legOffsets: [number, number, number][] = [
    [-0.54, 0.415, -0.34],
    [ 0.54, 0.415, -0.34],
    [-0.54, 0.415,  0.34],
    [ 0.54, 0.415,  0.34],
  ]
  for (const [x, y, z] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, frameMat)
    leg.position.set(x, y, z)
    leg.castShadow = true
    group.add(leg)
  }

  // Cross braces (front and back)
  const braceGeo = new THREE.BoxGeometry(1.0, 0.03, 0.03)
  const brace1 = new THREE.Mesh(braceGeo, frameMat)
  brace1.position.set(0, 0.25, -0.34)
  group.add(brace1)

  const brace2 = new THREE.Mesh(braceGeo, frameMat)
  brace2.position.set(0, 0.25, 0.34)
  group.add(brace2)

  return group
}

function disposeGroup(g: THREE.Group) {
  g.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const mat = child.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && tableGroup) ctx.removeObject(tableGroup)
  if (tableGroup) disposeGroup(tableGroup)
  tableGroup = null
})
</script>
