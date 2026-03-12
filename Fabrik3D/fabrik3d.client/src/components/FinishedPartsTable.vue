<template>
  <!-- Renderless – finished parts table with grid-based placement slots -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { getPartHalfHeight, type PartShape } from '../simulation/PartManager'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  /** Number of columns in the placement grid. */
  gridCols?: number
  /** Number of rows in the placement grid. */
  gridRows?: number
}>(), {
  position: () => [3.8, 0, 1.2] as [number, number, number],
  gridCols: 4,
  gridRows: 4,
})

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let tableGroup: THREE.Group | null = null

// ── Placement-slot tracking ────────────────────────────────────────
const occupied: boolean[][] = []
for (let r = 0; r < props.gridRows; r++) {
  occupied.push(new Array(props.gridCols).fill(false))
}

// Table top dimensions (must match the geometry below)
const TABLE_WIDTH = 1.2
const TABLE_DEPTH = 0.8
const SURFACE_Y = 0.87 // table-top Y in local space (0.85 top centre + 0.02 thick/2)

// Margins so parts don't sit on the very edge
const MARGIN = 0.08
const usableW = TABLE_WIDTH - MARGIN * 2
const usableD = TABLE_DEPTH - MARGIN * 2
const cellW = usableW / props.gridCols
const cellD = usableD / props.gridRows

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

// ── Table geometry ─────────────────────────────────────────────────
function buildTable(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'FinishedPartsTable'

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x607080,
    metalness: 0.7,
    roughness: 0.4,
  })
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x8090a0,
    metalness: 0.7,
    roughness: 0.4,
  })

  // Table top
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, 0.04, TABLE_DEPTH), topMat)
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

  // Cross braces
  const braceGeo = new THREE.BoxGeometry(1.0, 0.03, 0.03)
  const brace1 = new THREE.Mesh(braceGeo, frameMat)
  brace1.position.set(0, 0.25, -0.34)
  group.add(brace1)

  const brace2 = new THREE.Mesh(braceGeo, frameMat)
  brace2.position.set(0, 0.25, 0.34)
  group.add(brace2)

  // Optional: thin slot-grid lines on the surface to hint at placement spots
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x556677, transparent: true, opacity: 0.4 })
  const lineH = 0.002
  for (let c = 0; c <= props.gridCols; c++) {
    const lx = -TABLE_WIDTH / 2 + MARGIN + c * cellW
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.005, lineH, usableD), lineMat)
    line.position.set(lx, SURFACE_Y, 0)
    group.add(line)
  }
  for (let r = 0; r <= props.gridRows; r++) {
    const lz = -TABLE_DEPTH / 2 + MARGIN + r * cellD
    const line = new THREE.Mesh(new THREE.BoxGeometry(usableW, lineH, 0.005), lineMat)
    line.position.set(0, SURFACE_Y, lz)
    group.add(line)
  }

  return group
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Returns the next free world-space position on the table for a given
 * part shape, or `null` if the table is full.
 */
function getNextSlot(shape: PartShape): [number, number, number] | null {
  for (let r = 0; r < props.gridRows; r++) {
    for (let c = 0; c < props.gridCols; c++) {
      if (!occupied[r]![c]) {
        occupied[r]![c] = true

        // Local position of the grid cell centre
        const lx = -TABLE_WIDTH / 2 + MARGIN + (c + 0.5) * cellW
        const lz = -TABLE_DEPTH / 2 + MARGIN + (r + 0.5) * cellD
        const ly = SURFACE_Y + getPartHalfHeight(shape)

        // Convert to world space using the table's position prop
        return [
          props.position[0] + lx,
          props.position[1] + ly,
          props.position[2] + lz,
        ]
      }
    }
  }
  return null
}

/** Number of free slots remaining. */
function freeSlots(): number {
  let count = 0
  for (const row of occupied) {
    for (const cell of row) {
      if (!cell) count++
    }
  }
  return count
}

/** Reset all slots to empty. */
function reset(): void {
  for (const row of occupied) {
    row.fill(false)
  }
}

defineExpose({ getNextSlot, freeSlots, reset })

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
  if (ctx && tableGroup) ctx.removeObject(tableGroup)
  if (tableGroup) disposeGroup(tableGroup)
  tableGroup = null
})
</script>
