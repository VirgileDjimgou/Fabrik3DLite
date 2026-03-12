<template>
  <!-- Renderless – industrial pallet with cavity matrix and material loads -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import type { PalletCavityShape, RawMaterialType } from '../simulation/PalletModels'

const props = withDefaults(defineProps<{
  palletId: string
  rows?: number
  cols?: number
  cavityShape?: PalletCavityShape
  materialType?: RawMaterialType
  initialPosition?: [number, number, number]
  /** Flat occupancy array of length rows*cols. */
  occupied?: boolean[]
}>(), {
  rows: 5,
  cols: 5,
  cavityShape: 'hex',
  materialType: 'hex-billet',
  initialPosition: () => [0, 0, 0] as [number, number, number],
  occupied: () => [],
})

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
let palletGroup: THREE.Group | null = null

// ── Dimensions ─────────────────────────────────────────────────────
const PALLET_W = 0.60   // X extent
const PALLET_D = 0.60   // Z extent
const BASE_H = 0.05
const TRAY_H = 0.025
const CAVITY_DEPTH = 0.018
const CELL_PAD = 0.02

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || palletGroup) return
    palletGroup = buildPallet()
    palletGroup.position.set(...props.initialPosition)
    ctx.addObject(palletGroup)
  },
  { immediate: true },
)

// ── Materials ──────────────────────────────────────────────────────
function makeMaterials() {
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b2f20, roughness: 0.85, metalness: 0.1 })
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6, metalness: 0.25 })
  const partMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.25, metalness: 0.85 })
  return { baseMat, trayMat, partMat }
}

// ── Build ──────────────────────────────────────────────────────────
function buildPallet(): THREE.Group {
  const group = new THREE.Group()
  group.name = `Pallet_${props.palletId}`
  const { baseMat, trayMat, partMat } = makeMaterials()

  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(PALLET_W, BASE_H, PALLET_D), baseMat)
  base.position.y = BASE_H / 2
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  // Runner rails (bottom)
  const railGeo = new THREE.BoxGeometry(PALLET_W - 0.04, 0.015, 0.04)
  for (const zOff of [-0.18, 0, 0.18]) {
    const rail = new THREE.Mesh(railGeo, baseMat)
    rail.position.set(0, 0.008, zOff)
    rail.castShadow = true
    group.add(rail)
  }

  // Tray
  const trayY = BASE_H
  const tray = new THREE.Mesh(new THREE.BoxGeometry(PALLET_W - 0.02, TRAY_H, PALLET_D - 0.02), trayMat)
  tray.position.y = trayY + TRAY_H / 2
  tray.castShadow = true
  tray.receiveShadow = true
  group.add(tray)

  // Tray rim
  const rimH = 0.012
  const rimT = 0.01
  const rimMat = trayMat
  const innerW = PALLET_W - 0.04
  const innerD = PALLET_D - 0.04
  const rimY = trayY + TRAY_H + rimH / 2
  const rims: [number, number, number, number, number][] = [
    [innerW, rimH, rimT, 0, (innerD + rimT) / 2],
    [innerW, rimH, rimT, 0, -(innerD + rimT) / 2],
    [rimT, rimH, innerD, (innerW + rimT) / 2, 0],
    [rimT, rimH, innerD, -(innerW + rimT) / 2, 0],
  ]
  for (const [w, h, d, x, z] of rims) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat)
    rim.position.set(x, rimY, z)
    group.add(rim)
  }

  // Cavity grid & parts
  const usableW = innerW - CELL_PAD * 2
  const usableD = innerD - CELL_PAD * 2
  const cellW = usableW / props.cols
  const cellD = usableD / props.rows
  const cavityRadius = Math.min(cellW, cellD) * 0.38
  const surfaceY = trayY + TRAY_H + 0.001

  const occ = props.occupied
  for (let r = 0; r < props.rows; r++) {
    for (let c = 0; c < props.cols; c++) {
      const cx = -usableW / 2 + (c + 0.5) * cellW
      const cz = -usableD / 2 + (r + 0.5) * cellD

      // Cavity indent
      const cavGeo = createCavityGeo(props.cavityShape, cavityRadius, CAVITY_DEPTH)
      const cav = new THREE.Mesh(cavGeo, trayMat)
      cav.position.set(cx, surfaceY - CAVITY_DEPTH / 2, cz)
      group.add(cav)

      // Part if occupied
      const idx = r * props.cols + c
      const isOccupied = occ.length > idx ? occ[idx] : true
      if (isOccupied) {
        const partGeo = createPartGeo(props.cavityShape, cavityRadius * 0.85)
        const part = new THREE.Mesh(partGeo, partMat)
        part.position.set(cx, surfaceY + partHeight(props.cavityShape, cavityRadius * 0.85) / 2, cz)
        part.castShadow = true
        group.add(part)
      }
    }
  }

  return group
}

function createCavityGeo(shape: PalletCavityShape, r: number, depth: number): THREE.BufferGeometry {
  switch (shape) {
    case 'hex':
      return new THREE.CylinderGeometry(r, r, depth, 6)
    case 'circle':
      return new THREE.CylinderGeometry(r, r, depth, 20)
    case 'square':
      return new THREE.BoxGeometry(r * 1.6, depth, r * 1.6)
  }
}

function createPartGeo(shape: PalletCavityShape, r: number): THREE.BufferGeometry {
  const h = partHeight(shape, r)
  switch (shape) {
    case 'hex':
      return new THREE.CylinderGeometry(r, r, h, 6)
    case 'circle':
      return new THREE.CylinderGeometry(r, r, h, 16)
    case 'square':
      return new THREE.BoxGeometry(r * 1.5, h, r * 1.5)
  }
}

function partHeight(shape: PalletCavityShape, r: number): number {
  switch (shape) {
    case 'hex': return r * 1.8
    case 'circle': return r * 2.0
    case 'square': return r * 1.4
  }
}

/** Move the pallet to a new world-space X position. */
function setWorldX(x: number): void {
  if (palletGroup) palletGroup.position.x = x
}

defineExpose({ setWorldX })

// ── Cleanup ────────────────────────────────────────────────────────
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
  if (ctx && palletGroup) ctx.removeObject(palletGroup)
  if (palletGroup) disposeGroup(palletGroup)
  palletGroup = null
})
</script>
