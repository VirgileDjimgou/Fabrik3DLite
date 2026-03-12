<template>
  <!-- Renderless – large industrial CNC machining centre (white body) -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  /** Rotation around Y in radians. */
  rotationY?: number
}>(), {
  position: () => [0, 0, 0] as [number, number, number],
  rotationY: 0,
})

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
let machineGroup: THREE.Group | null = null

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || machineGroup) return
    machineGroup = buildMachine()
    machineGroup.position.set(...props.position)
    machineGroup.rotation.y = props.rotationY
    ctx.addObject(machineGroup)
  },
  { immediate: true },
)

function buildMachine(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'LargeCNC'

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeaeaea, metalness: 0.15, roughness: 0.45 })
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.35 })
  const chamberMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2, roughness: 0.8 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    metalness: 0.7,
    roughness: 0.15,
    transparent: true,
    opacity: 0.45,
  })
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.3, roughness: 0.5 })
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00aa55, emissive: 0x004422, emissiveIntensity: 0.4 })

  // ── Main body ────────────────────────────────────────────────
  const bodyW = 2.0, bodyH = 2.2, bodyD = 1.6
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMat)
  body.position.set(0, bodyH / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Top housing
  const top = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.06, 0.12, bodyD + 0.06), trimMat)
  top.position.set(0, bodyH + 0.06, 0)
  top.castShadow = true
  group.add(top)

  // Base plinth
  const base = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.1, 0.1, bodyD + 0.1), trimMat)
  base.position.set(0, 0.05, 0)
  base.castShadow = true
  group.add(base)

  // ── Front face — door/window area ───────────────────────────
  // Door frame
  const doorW = 0.9, doorH = 1.0
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.08, doorH + 0.08, 0.05), trimMat)
  doorFrame.position.set(0, 1.0, bodyD / 2 + 0.005)
  group.add(doorFrame)

  // Window glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.02), glassMat)
  glass.position.set(0, 1.0, bodyD / 2 + 0.02)
  group.add(glass)

  // Chamber interior (visible through glass)
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.1, doorH - 0.1, 0.4), chamberMat)
  chamber.position.set(0, 1.0, bodyD / 2 - 0.22)
  group.add(chamber)

  // ── Control panel (right side, angled) ──────────────────────
  const panelGroup = new THREE.Group()
  panelGroup.position.set(bodyW / 2 + 0.02, 1.5, bodyD / 2 - 0.3)
  panelGroup.rotation.y = -Math.PI / 8

  const panelBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), panelMat)
  panelGroup.add(panelBody)

  // Screen
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.28, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x002211, emissive: 0x002211, emissiveIntensity: 0.5 }),
  )
  screen.position.set(0.03, 0.05, 0)
  panelGroup.add(screen)

  group.add(panelGroup)

  // ── Status lights on top ───────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), accentMat)
    light.position.set(-0.12 + i * 0.12, bodyH + 0.15, 0)
    group.add(light)
  }

  // ── Side vents (left side) ─────────────────────────────────
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.5 })
  for (let i = 0; i < 5; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.5), ventMat)
    vent.position.set(-bodyW / 2 - 0.005, 1.2 + i * 0.1, 0)
    group.add(vent)
  }

  // ── Chip tray at base front ────────────────────────────────
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.2), trimMat)
  tray.position.set(0, 0.13, bodyD / 2 + 0.12)
  tray.castShadow = true
  group.add(tray)

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
  if (ctx && machineGroup) ctx.removeObject(machineGroup)
  if (machineGroup) disposeGroup(machineGroup)
  machineGroup = null
})
</script>
