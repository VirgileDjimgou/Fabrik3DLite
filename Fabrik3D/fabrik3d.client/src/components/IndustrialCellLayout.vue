<template>
  <ThreeScene>
    <!-- Robot at scene origin (0, 0, 0) -->
    <IndustrialRobotComponent @controller-ready="onControllerReady" />

    <!-- Work table on the left -->
    <WorkTable :position="tablePos" />
    <MetalPartsSpawner
      ref="spawnerRef"
      :table-position="tablePos"
      :count="6"
      @parts-ready="onPartsReady"
    />

    <!-- CNC machine on the right (rotated by CellSceneSetup to face robot) -->
    <CNCMachine
      ref="cncRef"
      :position="cncPos"
      :machining-duration="3"
      @machining-complete="onMachiningComplete"
    />

    <!-- Conveyor belt near CNC output -->
    <ConveyorBelt :position="conveyorPos" :length="2" :speed="0.3" />

    <!-- Factory floor with safety markings -->
    <FactoryFloor />

    <!-- Scene configuration (camera, helpers, CNC orientation) – must be last -->
    <CellSceneSetup />
  </ThreeScene>
  <RobotAxesDebugger :controller="robotController" />
  <SimulationControls :controller="robotController" />
</template>

<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import ThreeScene from './ThreeScene.vue'
import IndustrialRobotComponent from './IndustrialRobotComponent.vue'
import RobotAxesDebugger from './RobotAxesDebugger.vue'
import SimulationControls from './SimulationControls.vue'
import WorkTable from './WorkTable.vue'
import MetalPartsSpawner from './MetalPartsSpawner.vue'
import CNCMachine from './CNCMachine.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import FactoryFloor from './FactoryFloor.vue'
import CellSceneSetup from './CellSceneSetup.vue'
import type { RobotController } from '../simulation/RobotController'
import type { PartManager } from '../simulation/PartManager'

// ── Layout positions (easy to adjust) ──────────────────────────────
const tablePos: [number, number, number] = [-2.5, 0, 0]    // work table on the left
const cncPos: [number, number, number] = [2.5, 0, 0]       // CNC machine on the right
const conveyorPos: [number, number, number] = [4.5, 0, 0]   // conveyor near CNC output

// ── Component refs ─────────────────────────────────────────────────
const robotController = shallowRef<RobotController | null>(null)
const spawnerRef = ref<InstanceType<typeof MetalPartsSpawner> | null>(null)
const cncRef = ref<InstanceType<typeof CNCMachine> | null>(null)
let partManager: PartManager | null = null

function onControllerReady(controller: RobotController) {
  robotController.value = controller
}

function onPartsReady(manager: PartManager) {
  partManager = manager

  // Wire part-manager events to MetalPart component visuals
  manager.onPartPicked = (part) => {
    spawnerRef.value?.getPartRef(part.id)?.pick()
  }
  manager.onPartPlaced = (part) => {
    spawnerRef.value?.getPartRef(part.id)?.place(
      part.position.x,
      part.position.y,
      part.position.z,
    )
  }
  manager.onPartMachined = (part) => {
    spawnerRef.value?.getPartRef(part.id)?.markAsMachined()
  }
}

function onMachiningComplete() {
  // After machining, reset the CNC to idle so it can accept the next part
  cncRef.value?.unloadComplete()
}
</script>
