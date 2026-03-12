<template>
  <!-- Renderless – larger robot for the dual-conveyor scene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { IndustrialRobot, type RobotMaterials, type RobotDimensions } from '../robot/IndustrialRobot'
import { RobotController } from '../simulation/RobotController'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  dimensions?: RobotDimensions
}>(), {
  position: () => [0, 0, 0] as [number, number, number],
  dimensions: () => ({
    scale: 1.25,
    upperArmLength: 1.05,
    forearmLength: 0.88,
  }),
})

const emit = defineEmits<{
  (e: 'controller-ready', controller: RobotController): void
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

let robot: IndustrialRobot | null = null
const controller = new RobotController()

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || robot) return

    const materials: RobotMaterials = {
      body: new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.4, roughness: 0.35 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 }),
      gripper: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5, roughness: 0.4 }),
    }

    robot = new IndustrialRobot(materials, props.dimensions)
    robot.root.position.set(...props.position)

    robot.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    ctx.addObject(robot.root)

    controller.onJointsChanged = (angles) => {
      robot?.setJointAngles(angles)
    }

    animLoop.onFrame(() => {
      controller.update(performance.now() / 1000)
    })

    emit('controller-ready', controller)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && robot) ctx.removeObject(robot.root)
  robot?.dispose()
  robot = null
})
</script>
