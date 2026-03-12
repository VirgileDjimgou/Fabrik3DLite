<template>
  <!-- Renderless – wider factory floor for dual-conveyor cell -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { DUAL_CELL_POSITIONS } from '../simulation/DualCellLayout'

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
  group.name = 'WideFactoryFloor'

  const pos = DUAL_CELL_POSITIONS

  // ── Concrete floor ──────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a,
    roughness: 0.95,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.001, 0.5)
  floor.receiveShadow = true
  group.add(floor)

  // ── Safety zone markings ────────────────────────────────────────
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xccaa00 })
  const t = 0.04
  const h = 0.003

  const left = -6.5, right = 6.5, front = 5, back = -3.5
  const cx = (left + right) / 2
  const cz = (front + back) / 2
  const w = right - left
  const d = front - back

  for (const z of [front, back]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), lineMat)
    line.position.set(cx, 0.002, z)
    group.add(line)
  }
  for (const x of [left, right]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), lineMat)
    line.position.set(x, 0.002, cz)
    group.add(line)
  }

  // Robot center cross
  const crossLen = 0.6
  const crossThick = 0.02
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(crossLen, h, crossThick), lineMat)
  cross1.position.set(0, 0.002, 0)
  group.add(cross1)
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(crossThick, h, crossLen), lineMat)
  cross2.position.set(0, 0.002, 0)
  group.add(cross2)

  // ── Conveyor lane markers (dashed lines along X at each conveyor Z) ──
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x887744 })
  const laneZ = pos.leftConveyor[2]   // both conveyors share the same Z
  for (const laneX of [pos.leftConveyor[0], pos.rightConveyor[0]]) {
    for (let x = laneX - 3.2; x <= laneX + 3.2; x += 0.8) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.03), laneMat)
      dash.position.set(x, 0.002, laneZ - 0.35)
      group.add(dash)
      const dash2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.03), laneMat)
      dash2.position.set(x, 0.002, laneZ + 0.35)
      group.add(dash2)
    }
  }

  // ── CNC zone marking (dashed rectangle around CNC) ──────────────
  const cncX = pos.cnc[0], cncZ = pos.cnc[2]
  const cncZoneW = 2.4, cncZoneD = 2.0
  const cncLineMat = new THREE.MeshBasicMaterial({ color: 0x996633 })
  for (const dz of [cncZoneD / 2, -cncZoneD / 2]) {
    for (let x = cncX - cncZoneW / 2; x <= cncX + cncZoneW / 2; x += 0.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.03), cncLineMat)
      dash.position.set(x, 0.002, cncZ + dz)
      group.add(dash)
    }
  }
  for (const dx of [cncZoneW / 2, -cncZoneW / 2]) {
    for (let z = cncZ - cncZoneD / 2; z <= cncZ + cncZoneD / 2; z += 0.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.2), cncLineMat)
      dash.position.set(cncX + dx, 0.002, z)
      group.add(dash)
    }
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
