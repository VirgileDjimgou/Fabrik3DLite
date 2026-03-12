<template>
  <!-- Renderless – factory floor for single-conveyor cell -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'

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
  group.name = 'SingleConveyorFloor'

  const pos = SINGLE_CELL_POSITIONS
  const h = 0.003
  const t = 0.04

  // ── Concrete floor ──────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a,
    roughness: 0.95,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.001, 0)
  floor.receiveShadow = true
  group.add(floor)

  // ── Safety perimeter ────────────────────────────────────────────
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xccaa00 })
  const left = -5.5, right = 5.5, front = 5.5, back = -4.5
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

  // ── Robot center cross ──────────────────────────────────────────
  const crossLen = 0.6
  const crossThick = 0.02
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(crossLen, h, crossThick), lineMat)
  cross1.position.set(0, 0.002, 0)
  group.add(cross1)
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(crossThick, h, crossLen), lineMat)
  cross2.position.set(0, 0.002, 0)
  group.add(cross2)

  // ── Conveyor lane markers (dashed, along X at conveyor Z) ───────
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x887744 })
  const convZ = pos.conveyor[2]
  for (let x = -3.5; x <= 3.5; x += 0.8) {
    for (const dz of [-0.35, 0.35]) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.03), laneMat)
      dash.position.set(x, 0.002, convZ + dz)
      group.add(dash)
    }
  }

  // ── CNC zone marking ────────────────────────────────────────────
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

  // ── Clear-zone markers between robot and CNC ────────────────────
  const clearMat = new THREE.MeshBasicMaterial({ color: 0x556644 })
  for (let z = 0.5; z <= cncZ - 1.2; z += 0.6) {
    for (const dx of [-0.8, 0.8]) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.25), clearMat)
      dash.position.set(dx, 0.002, z)
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
