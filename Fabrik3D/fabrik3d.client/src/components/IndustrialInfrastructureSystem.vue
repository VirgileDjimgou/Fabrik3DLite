<template><!-- Renderer-only industrial infrastructure; runtime/collision remains declarative. --></template>

<script setup lang="ts">
import { inject, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { SAFETY_VISUAL_COLORS, infrastructureState } from '../safety'

const props = withDefaults(defineProps<{
  cncState: string
  online?: boolean
  emergencyStop?: boolean
  gateOpen?: boolean
}>(), { online: true, emergencyStop: false, gateOpen: false })

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
let root: THREE.Group | null = null
let statusMeshes: THREE.Mesh[] = []

function box(parent: THREE.Object3D, size: [number, number, number], color: number, position: [number, number, number], name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, metalness: .45, roughness: .5 }))
  mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, color: number, position: [number, number, number], name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), new THREE.MeshStandardMaterial({ color, metalness: .35, roughness: .4, emissive: color }))
  mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh
}

function build(): THREE.Group {
  const group = new THREE.Group(); group.name = 'IndustrialInfrastructureSystem'
  const cabinet = 0x52616a, panel = 0x1f2b31, steel = 0x3d474d, yellow = 0xd6a400, red = 0xc93939

  // Static cabinets and services make the cell legible without gaining runtime behavior.
  box(group, [.8, 1.8, .65], cabinet, [-3.95, .9, 3.55], 'infrastructure:robot-controller-cabinet')
  box(group, [1, 2, .5], cabinet, [3.95, 1, 3.55], 'infrastructure:plc-cabinet')
  box(group, [.7, 1.6, .55], cabinet, [3.95, .8, -2.75], 'infrastructure:utility-cabinet')
  box(group, [.55, 1.1, .45], steel, [3.1, .55, 3.45], 'infrastructure:operator-hmi-pedestal')
  box(group, [.4, .22, .1], panel, [3.1, 1.24, 3.32], 'infrastructure:operator-hmi-screen')
  box(group, [7.5, .12, .28], steel, [0, 2.45, -3.25], 'infrastructure:cable-tray')
  box(group, [.35, .7, .28], steel, [-3.5, .35, 3.45], 'infrastructure:pneumatic-service')

  // Pedestal E-stop, scanner and stack lights receive visual status only.
  box(group, [.28, .9, .28], steel, [-3.15, .45, 3.2], 'safety:emergency-stop-pedestal')
  statusMeshes.push(cylinder(group, .115, .08, red, [-3.15, .95, 3.2], 'safety:emergency-stop'))
  statusMeshes.push(cylinder(group, .14, .12, yellow, [2.7, .12, 2.35], 'safety:area-scanner'))
  for (const [height, color] of [[1.95, 0x20a65a], [2.1, yellow], [2.25, red]] as [number, number][]) {
    statusMeshes.push(cylinder(group, .08, .12, color, [1.25, height, 3.35], 'safety:stack-light'))
  }
  return group
}

function update(): void {
  const color = SAFETY_VISUAL_COLORS[infrastructureState(props.cncState, props.online, props.emergencyStop, props.gateOpen)]
  for (const mesh of statusMeshes) {
    const material = mesh.material as THREE.MeshStandardMaterial
    material.color.set(color); material.emissive.set(color)
  }
}

watch(() => sceneCtx.value, (ctx) => { if (ctx && !root) { root = build(); ctx.addObject(root); update() } }, { immediate: true })
watch(() => [props.cncState, props.online, props.emergencyStop, props.gateOpen], update)
onBeforeUnmount(() => {
  if (root) sceneCtx.value?.removeObject(root)
  root?.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose()
      const material = node.material
      Array.isArray(material) ? material.forEach(item => item.dispose()) : material.dispose()
    }
  })
  root = null; statusMeshes = []
})
</script>
