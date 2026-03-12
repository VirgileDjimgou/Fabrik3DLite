<template>
  <!-- Renderless – draws / removes trajectory line in the scene -->
</template>

<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { SCENE_CONTEXT_KEY } from '../composables/injectionKeys'
import { computeForwardKinematics } from '../simulation/ForwardKinematics'
import type { Trajectory } from '../simulation/TrajectoryPlanner'

const props = defineProps<{
  trajectory: Trajectory | null
  color?: number
  sampleStep?: number
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!

let line: THREE.Line | null = null

function clearLine() {
  if (line) {
    sceneCtx.value?.removeObject(line)
    line.geometry.dispose()
    ;(line.material as THREE.LineBasicMaterial).dispose()
    line = null
  }
}

function drawTrajectory(traj: Trajectory) {
  clearLine()
  const ctx = sceneCtx.value
  if (!ctx) return

  const step = props.sampleStep ?? 3
  const points: THREE.Vector3[] = []

  for (let i = 0; i < traj.points.length; i += step) {
    const fk = computeForwardKinematics(traj.points[i]!.angles)
    points.push(fk.position)
  }
  // Ensure last point is included
  const last = traj.points[traj.points.length - 1]
  if (last) {
    const fk = computeForwardKinematics(last.angles)
    points.push(fk.position)
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: props.color ?? 0x00ffaa,
    linewidth: 2,
  })
  line = new THREE.Line(geometry, material)
  line.name = 'TrajectoryPreview'
  ctx.addObject(line)
}

watch(
  () => props.trajectory,
  (traj) => {
    if (traj) drawTrajectory(traj)
    else clearLine()
  },
)

onBeforeUnmount(() => clearLine())
</script>
