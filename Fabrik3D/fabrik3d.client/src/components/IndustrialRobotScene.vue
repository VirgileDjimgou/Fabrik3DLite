<template>
  <ThreeScene>
    <IndustrialRobotComponent @controller-ready="onControllerReady" />
    <TrajectoryPreview :trajectory="activeTrajectory" />
  </ThreeScene>
  <RobotAxesDebugger :controller="robotController" />
  <SimulationControls :controller="robotController" />
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import ThreeScene from './ThreeScene.vue'
import IndustrialRobotComponent from './IndustrialRobotComponent.vue'
import RobotAxesDebugger from './RobotAxesDebugger.vue'
import SimulationControls from './SimulationControls.vue'
import TrajectoryPreview from './TrajectoryPreview.vue'
import type { RobotController } from '../simulation/RobotController'
import type { Trajectory } from '../simulation/TrajectoryPlanner'

const robotController = shallowRef<RobotController | null>(null)
const activeTrajectory = shallowRef<Trajectory | null>(null)

function onControllerReady(controller: RobotController) {
  robotController.value = controller
}
</script>
