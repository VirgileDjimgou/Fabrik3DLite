<template>
  <ThreeScene>
    <!-- Robot at cell centre (slightly larger) -->
    <ScaledRobotComponent
      :position="layout.robot"
      :dimensions="{ scale: 1.25, upperArmLength: 1.05, forearmLength: 0.88 }"
      @controller-ready="onControllerReady"
    />

    <!-- Left conveyor – incoming raw material (runs along X) -->
    <ConveyorBelt
      :position="layout.leftConveyor"
      :length="conveyors.length"
      :speed="conveyors.incomingSpeed"
    />
    <PalletConveyorFeed
      :flow-config="leftFlowCfg"
      :conveyor-surface-y="conveyors.surfaceY"
      :conveyor-z="layout.leftConveyor[2]"
    />

    <!-- Right conveyor – output line (runs along X, reversed) -->
    <ConveyorBelt
      :position="layout.rightConveyor"
      :length="conveyors.length"
      :speed="-conveyors.outgoingSpeed"
    />

    <!-- CNC machine – centered in front of robot, door faces robot -->
    <LargeCNCMachine
      :position="layout.cnc"
      :rotation-y="layout.cncRotationY"
    />

    <!-- Floor & scene setup (must be last) -->
    <WideFactoryFloor />
    <DualConveyorSceneSetup />
  </ThreeScene>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import ThreeScene from './ThreeScene.vue'
import ScaledRobotComponent from './ScaledRobotComponent.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import PalletConveyorFeed from './PalletConveyorFeed.vue'
import LargeCNCMachine from './LargeCNCMachine.vue'
import WideFactoryFloor from './WideFactoryFloor.vue'
import DualConveyorSceneSetup from './DualConveyorSceneSetup.vue'
import type { RobotController } from '../simulation/RobotController'
import {
  DUAL_CELL_POSITIONS,
  DUAL_CELL_CONVEYORS,
  LEFT_FLOW_CONFIG,
} from '../simulation/DualCellLayout'

// ── Layout (from centralised config) ───────────────────────────────
const layout = DUAL_CELL_POSITIONS
const conveyors = DUAL_CELL_CONVEYORS
const leftFlowCfg = { ...LEFT_FLOW_CONFIG }

// ── Controller ─────────────────────────────────────────────────────
const robotController = shallowRef<RobotController | null>(null)

function onControllerReady(controller: RobotController) {
  robotController.value = controller
}
</script>
