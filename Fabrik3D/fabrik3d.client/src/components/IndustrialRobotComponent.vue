<template>
  <!-- Renderless component – registers robot into the parent ThreeScene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { IndustrialRobot, type RobotMaterials } from '../robot/IndustrialRobot'
import { RobotController } from '../simulation/RobotController'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'

const emit = defineEmits<{
  (e: 'controller-ready', controller: RobotController): void
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

let robot: IndustrialRobot | null = null
const controller = new RobotController()

// Use watch instead of onMounted because the parent's onMounted (which
// calls init() and populates the shallowRef) fires AFTER children mount.
watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || robot) return

    const materials: RobotMaterials = {
      body: new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.4, roughness: 0.35 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 }),
      gripper: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5, roughness: 0.4 }),
    }

    robot = new IndustrialRobot(materials)

    // Enable shadows
    robot.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    ctx.addObject(robot.root)

    // Sync controller → visual joints
    controller.onJointsChanged = (angles) => {
      robot?.setJointAngles(angles)
    }

    // Demo motion
    animLoop.onFrame((time) => {
      controller.update(performance.now() / 1000)

      // If no trajectory is active, run a demo oscillation
      if (!controller.isMoving) {
        controller.setJointAngles([
          Math.sin(time * 0.4) * 1.2,
          Math.sin(time * 0.6) * 0.4 - 0.2,
          Math.sin(time * 0.8 + 1.0) * 0.5 + 0.3,
          time * 1.5,
          Math.sin(time * 1.0) * 0.6,
          Math.sin(time * 1.2 + 0.5) * 0.4,
        ])
      }
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
