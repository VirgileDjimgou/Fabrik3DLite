<template>
  <ThreeScene>
    <!-- Robot at cell centre -->
    <ScaledRobotComponent
      :position="layout.robot"
      :dimensions="{ scale: 1.25, upperArmLength: 1.05, forearmLength: 0.88 }"
      @controller-ready="onControllerReady"
    />

    <!-- Single conveyor behind the robot (pallets arrive along X) -->
    <ConveyorBelt
      :position="layout.conveyor"
      :length="conveyor.length"
      :speed="conveyor.speed"
      :rotation-y="layout.conveyorRotationY"
    />
    <PalletConveyorFeed
      ref="palletFeedRef"
      :flow-config="flowCfg"
      :conveyor-surface-y="conveyor.surfaceY"
      :conveyor-z="layout.conveyor[2]"
    />

    <!-- CNC machine centred in front of robot, door faces −Z -->
    <LargeCNCMachine
      ref="cncRef"
      :position="layout.cnc"
      :rotation-y="layout.cncRotationY"
      :machining-duration="5"
    />

    <!-- Floor & scene setup -->
    <SingleConveyorFloor />
    <SingleConveyorSceneSetup />
  </ThreeScene>

  <!-- Operator dashboard (outside ThreeScene so it overlays as HTML) -->
  <PalletMachiningDashboard
    :run-state="dashRunState"
    :phase="dashPhase"
    :pallet-id="dashPalletId"
    :material-type="dashMaterial"
    :current-row="dashRow"
    :current-col="dashCol"
    :slots-completed="dashCompleted"
    :remaining-slots="dashRemaining"
    :total-slots="dashTotal"
    :progress-percent="dashProgress"
    :cnc-state="dashCncState"
    @start="handleStart"
    @pause="handlePause"
    @resume="handleResume"
    @stop="handleStop"
    @reset="handleReset"
  />
</template>

<script setup lang="ts">
import { shallowRef, ref, watch } from 'vue'
import ThreeScene from './ThreeScene.vue'
import ScaledRobotComponent from './ScaledRobotComponent.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import PalletConveyorFeed from './PalletConveyorFeed.vue'
import LargeCNCMachine from './LargeCNCMachine.vue'
import SingleConveyorFloor from './SingleConveyorFloor.vue'
import SingleConveyorSceneSetup from './SingleConveyorSceneSetup.vue'
import PalletMachiningDashboard from './PalletMachiningDashboard.vue'
import type { RobotController } from '../simulation/RobotController'
import {
  PalletMachiningWorkflow,
  type PalletWorkflowCallbacks,
  type PalletWorkflowPhase,
  type WorkflowRunState,
} from '../simulation/PalletMachiningWorkflow'
import {
  SINGLE_CELL_POSITIONS,
  SINGLE_CELL_CONVEYOR,
  SINGLE_CELL_FLOW,
} from '../simulation/SingleConveyorCellLayout'

// ── Layout (from centralised config) ───────────────────────────────
const layout = SINGLE_CELL_POSITIONS
const conveyor = SINGLE_CELL_CONVEYOR
const flowCfg = { ...SINGLE_CELL_FLOW }

// ── Component refs ─────────────────────────────────────────────────
const palletFeedRef = ref<InstanceType<typeof PalletConveyorFeed> | null>(null)
const cncRef = ref<InstanceType<typeof LargeCNCMachine> | null>(null)

// ── Dashboard reactive state ───────────────────────────────────────
const dashRunState = ref<WorkflowRunState>('idle')
const dashPhase = ref<PalletWorkflowPhase>('IDLE')
const dashPalletId = ref('')
const dashMaterial = ref('')
const dashRow = ref(0)
const dashCol = ref(0)
const dashCompleted = ref(0)
const dashRemaining = ref(0)
const dashTotal = ref(0)
const dashProgress = ref(0)
const dashCncState = ref('IDLE')

// ── Controller & workflow ──────────────────────────────────────────
const robotController = shallowRef<RobotController | null>(null)
let workflow: PalletMachiningWorkflow | null = null
let workflowUpdateHooked = false

function onControllerReady(controller: RobotController) {
  robotController.value = controller
  ensureWorkflow()
}

// ── Workflow creation (lazy, once) ─────────────────────────────────

function ensureWorkflow(): PalletMachiningWorkflow | null {
  if (workflow) return workflow
  const ctrl = robotController.value
  if (!ctrl) return null

  const callbacks: PalletWorkflowCallbacks = {
    openCNCDoor: () => cncRef.value?.loadPart(),
    startCNCMachining: () => cncRef.value?.startMachining(),
    cncUnloadComplete: () => cncRef.value?.unloadComplete(),
    getCNCState: () => cncRef.value?.state ?? 'IDLE',
    hideSlotPart: (palletId, row, col) => {
      const comp = palletFeedRef.value?.getPalletComponent(palletId)
      comp?.setSlotVisible(row, col, false)
    },
    showSlotPart: (palletId, row, col) => {
      const comp = palletFeedRef.value?.getPalletComponent(palletId)
      comp?.setSlotVisible(row, col, true)
    },
  }

  workflow = new PalletMachiningWorkflow(ctrl, callbacks)

  workflow.onPhaseChanged = (phase) => {
    dashPhase.value = phase
    syncDashboard()
  }
  workflow.onRunStateChanged = (s) => {
    dashRunState.value = s
    syncDashboard()
  }
  workflow.onSlotComplete = () => {
    syncDashboard()
  }
  workflow.onPalletComplete = () => {
    syncDashboard()
  }

  // Hook workflow.update() into the controller's frame loop (once).
  if (!workflowUpdateHooked) {
    workflowUpdateHooked = true
    const origUpdate = ctrl.update.bind(ctrl)
    ctrl.update = (time: number) => {
      origUpdate(time)
      workflow?.update()
      // refresh CNC state each frame
      dashCncState.value = cncRef.value?.state ?? 'IDLE'
    }
  }

  return workflow
}

function syncDashboard(): void {
  if (!workflow) return
  dashCompleted.value = workflow.slotsCompleted
  dashRemaining.value = workflow.remainingSlots
  dashTotal.value = workflow.totalSlots
  dashProgress.value = workflow.progressPercent
  dashRow.value = workflow.currentRow
  dashCol.value = workflow.currentCol
  const p = workflow.pallet
  dashPalletId.value = p?.id ?? ''
  dashMaterial.value = p?.materialType ?? ''
}

// ── Dashboard event handlers ───────────────────────────────────────

function handleStart(): void {
  const wf = ensureWorkflow()
  if (!wf) return
  const pallet = palletFeedRef.value?.getFirstStoppedPallet()
  if (!pallet) return
  wf.start(pallet)
  syncDashboard()
}

function handlePause(): void {
  workflow?.pause()
}

function handleResume(): void {
  workflow?.resume()
}

function handleStop(): void {
  workflow?.stop()
}

function handleReset(): void {
  workflow?.reset()
  dashPhase.value = 'IDLE'
  dashRunState.value = 'idle'
  dashPalletId.value = ''
  dashMaterial.value = ''
  dashRow.value = 0
  dashCol.value = 0
  dashCompleted.value = 0
  dashRemaining.value = 0
  dashTotal.value = 0
  dashProgress.value = 0
}

// Attempt to create workflow when pallet feed ref becomes available
watch(
  () => palletFeedRef.value,
  () => ensureWorkflow(),
)
</script>
