<template>
  <!-- Renderless – registers a catalog robot into the parent ThreeScene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { IndustrialRobot, type RobotMaterials } from '../robot/IndustrialRobot'
import { RobotVisualBinding } from '../robot/RobotVisualBinding'
import { RobotController } from '../simulation/RobotController'
import { MEDIUM_6AXIS, type RobotDefinition } from '../robot/catalog'
import { toJointLimits } from '../robot/catalog'
import { createRobotKinematics } from '../kinematics'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'
import { createIndustrialAssetRegistry, EquipmentVisualProvider, ThreeGlbAssetLoader, type EquipmentVisualLoadResult } from '../equipment/assets'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  profile?: RobotDefinition
}>(), {
  position: () => [0, 0, 0] as [number, number, number],
  profile: () => MEDIUM_6AXIS,
})

const emit = defineEmits<{
  (e: 'controller-ready', controller: RobotController): void
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

let robot: IndustrialRobot | null = null
let controller: RobotController | null = null
let loadedVisual: EquipmentVisualLoadResult | null = null
let visualBinding: RobotVisualBinding | null = null
let disposed = false

async function buildRobot(ctx: { addObject: (o: THREE.Object3D) => void }): Promise<void> {
  const profile = props.profile
  const materials: RobotMaterials = {
    body: new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.4, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 }),
    gripper: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5, roughness: 0.4 }),
  }

  const registry = createIndustrialAssetRegistry()
  const provider = new EquipmentVisualProvider(registry, new ThreeGlbAssetLoader())
  const registeredVisual = registry.get(profile.visualAsset)
  const visualRig = registeredVisual.source === 'glb' ? registeredVisual.manifest.robotRig : undefined
  loadedVisual = await provider.load(profile.visualAsset, () => {
    robot = new IndustrialRobot(materials, profile.dimensions, toJointLimits(profile.joints))
    return robot.root
  })
  if (disposed) {
    loadedVisual.dispose()
    robot?.dispose()
    return
  }
  const root = loadedVisual.root
  root.position.set(...props.position)
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  ctx.addObject(root)
  if (loadedVisual.source === 'glb') visualBinding = new RobotVisualBinding(root, visualRig)

  controller = new RobotController({ limits: toJointLimits(profile.joints), kinematics: createRobotKinematics(profile) })
  controller.onJointsChanged = (angles) => {
    visualBinding?.setJointAngles(angles)
    robot?.setJointAngles(angles)
  }

  animLoop.onFrame(() => {
    controller?.update(performance.now() / 1000)
  })

  emit('controller-ready', controller)
}

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || loadedVisual) return
    void buildRobot(ctx)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  disposed = true
  if (ctx && loadedVisual) ctx.removeObject(loadedVisual.root)
  loadedVisual?.dispose()
  robot?.dispose()
  loadedVisual = null
  visualBinding = null
  robot = null
  controller = null
})
</script>
