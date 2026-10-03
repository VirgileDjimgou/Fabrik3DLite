<template>
  <!-- Renderless – factory floor for single-conveyor cell -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import { createMaterial } from '../equipment/visuals/materialLibrary'
import { buildFactoryEnvironment, disposeFactoryEnvironment } from '../equipment/visuals/factoryEnvironment'

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

const CNC_FLOOR_SIZE = { x: 14, z: 14 } as const

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

/**
 * S68: the CNC reference cell now uses the same coherent factory environment as
 * the four material-flow cells. Only the CNC-specific zone markings are added on
 * top, using the shared material vocabulary.
 */
function buildFloor(): THREE.Group {
  const group = buildFactoryEnvironment({
    sizeMeters: { ...CNC_FLOOR_SIZE },
    cellId: 'cnc-machine-tending',
    variant: 'industrial-hall',
  })

  const pos = SINGLE_CELL_POSITIONS
  const h = 0.004
  const safetyLine = createMaterial('safety-yellow-line')
  const hazard = createMaterial('hazard-amber')
  const clearZone = createMaterial('floor-marking-olive')

  const addMark = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, z: number) => {
    const mark = new THREE.Mesh(geometry, material)
    mark.name = name
    mark.position.set(x, h, z)
    group.add(mark)
    return mark
  }

  // ── Robot center cross ──────────────────────────────────────────
  addMark('cnc:robot-cross-x', new THREE.BoxGeometry(0.6, h, 0.02), safetyLine, 0, 0)
  addMark('cnc:robot-cross-z', new THREE.BoxGeometry(0.02, h, 0.6), safetyLine, 0, 0)

  // ── Conveyor lane markers (dashed, along X at conveyor Z) ───────
  const convZ = pos.conveyor[2]
  for (let x = -3.5; x <= 3.5; x += 0.8) {
    for (const dz of [-0.35, 0.35]) {
      addMark('cnc:conveyor-lane', new THREE.BoxGeometry(0.3, h, 0.03), hazard, x, convZ + dz)
    }
  }

  // ── CNC zone marking ────────────────────────────────────────────
  const cncX = pos.cnc[0], cncZ = pos.cnc[2]
  const cncZoneW = 2.4, cncZoneD = 2.0
  for (const dz of [cncZoneD / 2, -cncZoneD / 2]) {
    for (let x = cncX - cncZoneW / 2; x <= cncX + cncZoneW / 2; x += 0.5) {
      addMark('cnc:zone', new THREE.BoxGeometry(0.2, h, 0.03), hazard, x, cncZ + dz)
    }
  }
  for (const dx of [cncZoneW / 2, -cncZoneW / 2]) {
    for (let z = cncZ - cncZoneD / 2; z <= cncZ + cncZoneD / 2; z += 0.5) {
      addMark('cnc:zone', new THREE.BoxGeometry(0.03, h, 0.2), hazard, cncX + dx, z)
    }
  }

  // ── Clear-zone markers between robot and CNC ────────────────────
  for (let z = 0.5; z <= cncZ - 1.2; z += 0.6) {
    for (const dx of [-0.8, 0.8]) {
      addMark('cnc:clear-zone', new THREE.BoxGeometry(0.03, h, 0.25), clearZone, dx, z)
    }
  }

  return group
}

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && floorGroup) ctx.removeObject(floorGroup)
  if (floorGroup) disposeFactoryEnvironment(floorGroup)
  floorGroup = null
})
</script>
