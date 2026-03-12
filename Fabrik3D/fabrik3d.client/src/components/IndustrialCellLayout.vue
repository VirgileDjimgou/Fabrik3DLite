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
      :machining-duration="5"
      @machining-complete="onMachiningComplete"
    />

    <!-- Conveyor belt near CNC output -->
    <ConveyorBelt :position="conveyorPos" :length="2" :speed="0.3" />

    <!-- Finished-parts table near CNC output -->
    <FinishedPartsTable ref="finishedTableRef" :position="finishedTablePos" />

    <!-- Factory floor with safety markings -->
    <FactoryFloor />

    <!-- Scene configuration (camera, helpers, CNC orientation) – must be last -->
    <CellSceneSetup />
  </ThreeScene>
  <RobotAxesDebugger :controller="robotController" />
  <SimulationControls :controller="robotController" />
  <MachiningSimulationPanel
    :controller="robotController"
    :part-manager="activePartManager"
    :open-c-n-c-door="openCNCDoor"
    :start-c-n-c-machining="startCNCMachining"
    :cnc-unload-complete="cncUnloadComplete"
    :get-c-n-c-state="getCNCState"
    :get-finished-slot="getFinishedSlot"
    :on-part-picked="handlePartPicked"
    :on-part-placed="handlePartPlaced"
    :on-part-machined="handlePartMachined"
  />
</template>

<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import ThreeScene from './ThreeScene.vue'
import IndustrialRobotComponent from './IndustrialRobotComponent.vue'
import RobotAxesDebugger from './RobotAxesDebugger.vue'
import SimulationControls from './SimulationControls.vue'
import MachiningSimulationPanel from './MachiningSimulationPanel.vue'
import WorkTable from './WorkTable.vue'
import MetalPartsSpawner from './MetalPartsSpawner.vue'
import CNCMachine from './CNCMachine.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import FinishedPartsTable from './FinishedPartsTable.vue'
import FactoryFloor from './FactoryFloor.vue'
import CellSceneSetup from './CellSceneSetup.vue'
import type { RobotController } from '../simulation/RobotController'
import type { PartManager, MetalPartData, PartShape } from '../simulation/PartManager'

// ── Layout positions (easy to adjust) ──────────────────────────────
const tablePos: [number, number, number] = [-2.0, 0, 0]      // work table on the left
const cncPos: [number, number, number] = [2.5, 0, 0]         // CNC machine on the right
const conveyorPos: [number, number, number] = [4.5, 0, 0]    // conveyor near CNC output
const finishedTablePos: [number, number, number] = [0, 0, 1.5] // finished parts table

// ── Component refs ─────────────────────────────────────────────────
const robotController = shallowRef<RobotController | null>(null)
const spawnerRef = ref<InstanceType<typeof MetalPartsSpawner> | null>(null)
const cncRef = ref<InstanceType<typeof CNCMachine> | null>(null)
const finishedTableRef = ref<InstanceType<typeof FinishedPartsTable> | null>(null)
const activePartManager = shallowRef<PartManager | null>(null)

function onControllerReady(controller: RobotController) {
  robotController.value = controller
}

function onPartsReady(manager: PartManager) {
  activePartManager.value = manager
}

function onMachiningComplete() {
  // CNC emits this when machining finishes – state becomes UNLOADING.
  // The workflow detects UNLOADING and retrieves the part, then calls
  // cncUnloadComplete() to reset to IDLE.
}

// ── Callbacks for MachiningSimulationPanel ──────────────────────────

function openCNCDoor(): boolean {
  const cnc = cncRef.value
  if (!cnc) return false
  cnc.loadPart()
  return true
}

function startCNCMachining(): boolean {
  const cnc = cncRef.value
  if (!cnc) return false
  cnc.startMachining()
  return true
}

function cncUnloadComplete(): void {
  cncRef.value?.unloadComplete()
}

function getCNCState(): string {
  return cncRef.value?.state ?? 'IDLE'
}

function getFinishedSlot(shape: PartShape): [number, number, number] | null {
  return finishedTableRef.value?.getNextSlot(shape) ?? null
}

function handlePartPicked(part: MetalPartData): void {
  spawnerRef.value?.getPartRef(part.id)?.pick()
}

function handlePartPlaced(part: MetalPartData, pos: [number, number, number]): void {
  spawnerRef.value?.getPartRef(part.id)?.place(pos[0], pos[1], pos[2])
}

function handlePartMachined(part: MetalPartData): void {
  spawnerRef.value?.getPartRef(part.id)?.markAsMachined()
}
</script>
