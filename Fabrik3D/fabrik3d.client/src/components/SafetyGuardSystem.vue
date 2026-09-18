<template><!-- Renderless physical guards and diagnostic overlays. --></template>

<script setup lang="ts">
import { inject, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { SAFETY_VISUAL_COLORS, safetyVisualState } from '../safety/safetyVisualState'

const props = withDefaults(defineProps<{ cncState: string, online?: boolean }>(), { online: true })
const sceneCtx = inject(SCENE_CONTEXT_KEY)!
let root: THREE.Group | null = null
let diagnostics: THREE.Mesh | null = null
let stack: THREE.Mesh | null = null

function box(parent: THREE.Object3D, size: [number, number, number], color: number, position: [number, number, number], transparent = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5, transparent, opacity: transparent ? 0.13 : 1 }))
  mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh
}
function build(): THREE.Group {
  const group = new THREE.Group(); group.name = 'SafetyGuardSystem'
  const post = 0x38434a, mesh = 0x6d7780, yellow = 0xd6a400
  // Physical fence: posts, mesh panels and kick plates. The front centre is intentionally open for the documented robot/CNC corridor.
  for (const [x, z] of [[-4.8, -3.6], [4.8, -3.6], [-4.8, 4.7], [4.8, 4.7], [-4.8, 0.5], [4.8, 0.5]] as [number, number][]) {
    box(group, [0.09, 2.1, 0.09], post, [x, 1.05, z])
  }
  for (const [w, d, x, z] of [[9.6, 0.03, 0, -3.6], [0.03, 8.3, -4.8, 0.55], [0.03, 8.3, 4.8, 0.55], [3.4, 0.03, -3.1, 4.7], [3.4, 0.03, 3.1, 4.7]] as [number, number, number, number][]) {
    box(group, [w, 1.7, d], mesh, [x, 1.05, z]); box(group, [w, 0.18, d + 0.02], yellow, [x, 0.12, z])
  }
  // Interlocked swing gate beside the opening and a light-curtain representation; neither is a collision proxy.
  box(group, [0.06, 1.7, 1.35], mesh, [-1.8, 1.05, 4.7]); box(group, [0.12, 0.18, 0.12], 0xd64040, [-1.82, 1.85, 4.7])
  for (const x of [-0.55, 0.55]) box(group, [0.025, 1.45, 0.025], 0xd64a27, [x, 0.75, 2.25])
  diagnostics = box(group, [2.2, 0.02, 2.0], SAFETY_VISUAL_COLORS.safe, [0, 0.014, 1.3], true)
  stack = box(group, [0.11, 0.32, 0.11], SAFETY_VISUAL_COLORS.safe, [1.25, 2.36, 3.35])
  return group
}
function update(): void {
  const color = SAFETY_VISUAL_COLORS[safetyVisualState(props.cncState, props.online)]
  for (const mesh of [diagnostics, stack]) {
    const material = mesh?.material as THREE.MeshStandardMaterial | undefined
    material?.color.set(color); material?.emissive.set(color)
  }
}
watch(() => sceneCtx.value, (ctx) => { if (ctx && !root) { root = build(); ctx.addObject(root); update() } }, { immediate: true })
watch(() => [props.cncState, props.online], update)
onBeforeUnmount(() => { if (root) sceneCtx.value?.removeObject(root); root?.traverse((node) => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); const m = node.material; Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose() } }); root = null })
</script>
