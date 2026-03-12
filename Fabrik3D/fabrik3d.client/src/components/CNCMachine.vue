<template>
  <!-- Renderless – CNC machining center -->
</template>

<script setup lang="ts">
import { inject, watch, ref, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'
import type { CNCState } from '../simulation/PartManager'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  machiningDuration?: number
}>(), {
  position: () => [2, 0, 0] as [number, number, number],
  machiningDuration: 3,
})

const emit = defineEmits<{
  (e: 'machining-complete'): void
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

let machineGroup: THREE.Group | null = null
let doorMesh: THREE.Mesh | null = null
let statusLight: THREE.Mesh | null = null

const state = ref<CNCState>('IDLE')
let machiningTimer = 0
let doorTarget = 0 // 0 = closed, 1 = open
let doorCurrent = 0

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || machineGroup) return
    machineGroup = buildMachine()
    machineGroup.position.set(...props.position)
    ctx.addObject(machineGroup)

    animLoop.onFrame((_time, delta) => {
      animateDoor(delta)
      updateMachining(delta)
    })
  },
  { immediate: true },
)

function buildMachine(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'CNCMachine'

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, metalness: 0.5, roughness: 0.6 })
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.3, roughness: 0.5 })
  const chamberMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2, roughness: 0.8 })
  const doorMatl = new THREE.MeshStandardMaterial({ color: 0x4a6a4a, metalness: 0.5, roughness: 0.5 })

  // Machine body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.2), bodyMat)
  body.position.set(0, 0.9, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Machining chamber (front opening)
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), chamberMat)
  chamber.position.set(0, 0.85, 0.46)
  group.add(chamber)

  // Door (slides up when open)
  doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.03), doorMatl)
  doorMesh.position.set(0, 0.85, 0.62)
  doorMesh.castShadow = true
  group.add(doorMesh)

  // Control panel (tilted)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.05), panelMat)
  panel.position.set(0.55, 1.4, 0.55)
  panel.rotation.y = -Math.PI / 6
  panel.rotation.x = -Math.PI / 8
  group.add(panel)

  // Panel screen
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x003322, emissiveIntensity: 0.3 })
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.01), screenMat)
  screen.position.set(0.55, 1.42, 0.57)
  screen.rotation.y = -Math.PI / 6
  screen.rotation.x = -Math.PI / 8
  group.add(screen)

  // Status light on top
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5,
  })
  statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lightMat)
  statusLight.position.set(0, 1.85, 0)
  group.add(statusLight)

  return group
}

function setStatusColor(color: number) {
  if (!statusLight) return
  const mat = statusLight.material as THREE.MeshStandardMaterial
  mat.color.set(color)
  mat.emissive.set(color)
}

function animateDoor(delta: number) {
  if (!doorMesh) return
  const speed = 2.0
  if (doorCurrent < doorTarget) {
    doorCurrent = Math.min(doorCurrent + delta * speed, doorTarget)
  } else if (doorCurrent > doorTarget) {
    doorCurrent = Math.max(doorCurrent - delta * speed, doorTarget)
  }
  // Slide door upward when opening
  doorMesh.position.y = 0.85 + doorCurrent * 0.65
}

function updateMachining(delta: number) {
  if (state.value !== 'MACHINING') return
  machiningTimer -= delta
  if (machiningTimer <= 0) {
    state.value = 'UNLOADING'
    doorTarget = 1
    setStatusColor(0x0088ff)
    emit('machining-complete')
  }
}

/** Open the door and set state to LOADING. */
function loadPart(): void {
  if (state.value !== 'IDLE') return
  state.value = 'LOADING'
  doorTarget = 1
  setStatusColor(0xffaa00)
}

/** Close the door and begin simulated machining. */
function startMachining(): void {
  if (state.value !== 'LOADING') return
  state.value = 'MACHINING'
  doorTarget = 0
  machiningTimer = props.machiningDuration
  setStatusColor(0xff0000)
}

/** Reset machine to IDLE after part has been removed. */
function unloadComplete(): void {
  if (state.value !== 'UNLOADING') return
  state.value = 'IDLE'
  doorTarget = 0
  setStatusColor(0x00ff00)
}

defineExpose({ loadPart, startMachining, unloadComplete, state })

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
  doorMesh = null
  statusLight = null
})
</script>
