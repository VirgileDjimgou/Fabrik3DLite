<template>
  <!-- Renderless – animated industrial conveyor belt -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  length?: number
  speed?: number
}>(), {
  position: () => [2, 0, -1.5] as [number, number, number],
  length: 2,
  speed: 0.3,
})

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

let conveyorGroup: THREE.Group | null = null
let rollers: THREE.Mesh[] = []
let beltSegments: THREE.Mesh[] = []
let beltOffset = 0

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || conveyorGroup) return
    conveyorGroup = buildConveyor()
    conveyorGroup.position.set(...props.position)
    ctx.addObject(conveyorGroup)

    animLoop.onFrame((_time, delta) => {
      animateConveyor(delta)
    })
  },
  { immediate: true },
)

function buildConveyor(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'ConveyorBelt'

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 })
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.3 })
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.2, roughness: 0.8 })

  const halfLen = props.length / 2
  const beltWidth = 0.3
  const frameHeight = 0.6

  // Side frames (two long rails)
  const frameGeo = new THREE.BoxGeometry(props.length, 0.06, 0.04)
  const frame1 = new THREE.Mesh(frameGeo, frameMat)
  frame1.position.set(0, frameHeight, beltWidth / 2 + 0.02)
  frame1.castShadow = true
  group.add(frame1)

  const frame2 = new THREE.Mesh(frameGeo, frameMat)
  frame2.position.set(0, frameHeight, -beltWidth / 2 - 0.02)
  frame2.castShadow = true
  group.add(frame2)

  // Legs (four corners)
  const legGeo = new THREE.BoxGeometry(0.04, frameHeight - 0.03, 0.04)
  const legPositions: [number, number, number][] = [
    [-halfLen + 0.1, (frameHeight - 0.03) / 2,  beltWidth / 2 + 0.02],
    [-halfLen + 0.1, (frameHeight - 0.03) / 2, -beltWidth / 2 - 0.02],
    [ halfLen - 0.1, (frameHeight - 0.03) / 2,  beltWidth / 2 + 0.02],
    [ halfLen - 0.1, (frameHeight - 0.03) / 2, -beltWidth / 2 - 0.02],
  ]
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, frameMat)
    leg.position.set(x, y, z)
    leg.castShadow = true
    group.add(leg)
  }

  // Rollers (cylindrical, spanning the belt width)
  const rollerCount = Math.max(4, Math.floor(props.length / 0.15))
  const rollerGeo = new THREE.CylinderGeometry(0.025, 0.025, beltWidth, 10)
  rollerGeo.rotateX(Math.PI / 2)

  for (let i = 0; i < rollerCount; i++) {
    const x = -halfLen + 0.075 + i * (props.length / rollerCount)
    const roller = new THREE.Mesh(rollerGeo, rollerMat)
    roller.position.set(x, frameHeight - 0.025, 0)
    group.add(roller)
    rollers.push(roller)
  }

  // Belt surface segments (animated)
  const segCount = Math.max(6, Math.floor(props.length / 0.08))
  const segGeo = new THREE.BoxGeometry(0.06, 0.008, beltWidth - 0.02)

  for (let i = 0; i < segCount; i++) {
    const x = -halfLen + 0.04 + i * (props.length / segCount)
    const seg = new THREE.Mesh(segGeo, beltMat)
    seg.position.set(x, frameHeight + 0.004, 0)
    group.add(seg)
    beltSegments.push(seg)
  }

  return group
}

function animateConveyor(delta: number) {
  const halfLen = props.length / 2
  const spacing = props.length / beltSegments.length

  beltOffset = (beltOffset + props.speed * delta) % props.length

  // Update belt segment positions with wrapping
  for (let i = 0; i < beltSegments.length; i++) {
    let x = -halfLen + spacing * 0.5 + i * spacing + beltOffset
    if (x > halfLen) x -= props.length
    beltSegments[i]!.position.x = x
  }

  // Rotate rollers
  for (const roller of rollers) {
    roller.rotation.z += props.speed * delta * 10
  }
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
  if (ctx && conveyorGroup) ctx.removeObject(conveyorGroup)
  if (conveyorGroup) disposeGroup(conveyorGroup)
  conveyorGroup = null
  rollers = []
  beltSegments = []
})
</script>
