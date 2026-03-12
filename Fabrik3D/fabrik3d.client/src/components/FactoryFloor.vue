<template>
  <!-- Renderless – industrial factory floor with safety zone markings -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let floorGroup: THREE.Group | null = null

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || floorGroup) return
    floorGroup = buildFloor()
    ctx.addObject(floorGroup)
  },
  { immediate: true },
)

function buildFloor(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'FactoryFloor'

  // ── Concrete floor (larger than the default 10×10) ──────────────
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a,
    roughness: 0.95,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(1, 0.001, 0) // slight Y offset, centered on cell
  floor.receiveShadow = true
  group.add(floor)

  // ── Safety zone markings (yellow boundary lines) ────────────────
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xccaa00 })
  const t = 0.04   // line thickness
  const h = 0.003  // line height

  // Safety perimeter around the entire cell
  const left = -3.8
  const right = 6.2
  const front = 2.2
  const back = -2.2
  const cx = (left + right) / 2
  const cz = (front + back) / 2
  const w = right - left
  const d = front - back

  // Front & back lines
  for (const z of [front, back]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), lineMat)
    line.position.set(cx, 0.002, z)
    group.add(line)
  }
  // Left & right lines
  for (const x of [left, right]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), lineMat)
    line.position.set(x, 0.002, cz)
    group.add(line)
  }

  // ── Robot center cross marker ───────────────────────────────────
  const crossLen = 0.5
  const crossThick = 0.02
  const cross1 = new THREE.Mesh(
    new THREE.BoxGeometry(crossLen, h, crossThick),
    lineMat,
  )
  cross1.position.set(0, 0.002, 0)
  group.add(cross1)

  const cross2 = new THREE.Mesh(
    new THREE.BoxGeometry(crossThick, h, crossLen),
    lineMat,
  )
  cross2.position.set(0, 0.002, 0)
  group.add(cross2)

  // ── Robot workspace arc (approximate with dashed line segments) ─
  const arcSegments = 32
  const arcRadius = 2.0
  const arcMat = new THREE.MeshBasicMaterial({ color: 0x886600 })
  for (let i = 0; i < arcSegments; i++) {
    // Dashed: skip every other segment
    if (i % 2 !== 0) continue
    const a0 = (i / arcSegments) * Math.PI * 2
    const a1 = ((i + 1) / arcSegments) * Math.PI * 2
    const mx = (Math.cos(a0) + Math.cos(a1)) / 2 * arcRadius
    const mz = (Math.sin(a0) + Math.sin(a1)) / 2 * arcRadius
    const len = arcRadius * (a1 - a0)
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(len, h, crossThick),
      arcMat,
    )
    seg.position.set(mx, 0.002, mz)
    seg.rotation.y = -(a0 + a1) / 2 + Math.PI / 2
    group.add(seg)
  }

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
  if (ctx && floorGroup) ctx.removeObject(floorGroup)
  if (floorGroup) disposeGroup(floorGroup)
  floorGroup = null
})
</script>
