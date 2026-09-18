<template>
  <ThreeScene>
    <!-- Robot at cell centre, driven by the selected catalog profile -->
    <ScaledRobotComponent
      :key="selectedRobotId"
      :position="layout.robot"
      :profile="selectedRobot"
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
  <RobotCatalogPanel
    :robots="catalogRobots"
    :selected-id="selectedRobotId"
    :tools="catalogTools"
    @select="selectRobot"
  />

  <KinematicsDeveloperOverlay v-if="expertMode"
    :controller="robotController"
    :model="selectedKinematics"
    :frames="cellFrames"
    :target="developerTarget"
  />

  <MotionSafetyPanel v-if="expertMode" :engine="safetyEngine" />
  <StepModePanel
    :active="stepMode.isEnabled"
    :checkpoint="stepCheckpoint"
    :speed="stepSpeed"
    @toggle="toggleStepMode"
    @speed="setStepSpeed"
    @expert="expertMode = $event"
    @next="advanceStep"
    @previous="showPreviousExplanation"
    @restart="restartGuidedRun"
  />
  <FaultTimelinePanel :key="timelineRevision" :faults="faults.activeFaults" :entries="timeline.all" @inject="injectFault" @action="actOnFault" />
  <LearningReportPanel :key="timelineRevision" :entries="timeline.all" :expected-actions="expectedLearningActions" @reset-scenario="instructorResetScenario" />

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
    :job-id="bridge.ctx.jobId ?? ''"
    :session-id="bridge.ctx.sessionId ?? ''"
    :task-id="bridge.ctx.taskId ?? ''"
    :mode="dashMode"
    :connection-state="dashConnection"
    :session-status="dashSessionStatus"
    @start="handleStart"
    @pause="handlePause"
    @resume="handleResume"
    @stop="handleStop"
    @reset="handleReset"
  />
</template>

<script setup lang="ts">
import { shallowRef, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ThreeScene from './ThreeScene.vue'
import ScaledRobotComponent from './ScaledRobotComponent.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import PalletConveyorFeed from './PalletConveyorFeed.vue'
import LargeCNCMachine from './LargeCNCMachine.vue'
import SingleConveyorFloor from './SingleConveyorFloor.vue'
import SingleConveyorSceneSetup from './SingleConveyorSceneSetup.vue'
import PalletMachiningDashboard from './PalletMachiningDashboard.vue'
import RobotCatalogPanel from './RobotCatalogPanel.vue'
import KinematicsDeveloperOverlay from './KinematicsDeveloperOverlay.vue'
import MotionSafetyPanel from './MotionSafetyPanel.vue'
import StepModePanel from './StepModePanel.vue'
import FaultTimelinePanel from './FaultTimelinePanel.vue'
import LearningReportPanel from './LearningReportPanel.vue'
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
import { SimulatorOrchestrationBridge, type BridgeMode } from '../services/simulatorOrchestrationBridge'
import type { ConnectionState } from '../services/orchestratorSignalR'
import { logDashboardSnapshot } from '../services/devLogger'
import {
  createSingleConveyorEquipmentRegistry,
  LegacyCncAdapter,
  LegacyPalletStationAdapter,
  LegacyRobotAdapter,
  type CncRuntime,
  type PalletStationRuntime,
  type RobotMotionRuntime,
} from '../equipment'
import {
  createDefaultRobotCatalog,
  DEFAULT_ROBOT_ID,
} from '../robot/catalog'
import {
  createCncTarget,
  createRobotKinematics,
  createSingleCellFrames,
  type WorkObjectTarget,
} from '../kinematics'
import { createSafetyRobotModel, MotionSafetyEngine, createSingleCellWorld } from '../safety'
import { StepModeController, type LearningCheckpoint } from '../learning/StepModeController'
import { FaultController, getFaultDefinition, type FaultAction, type FaultType } from '../faults'
import { TimelineRecorder, type TimelineContext } from '../timeline'

// ── Layout (from centralised config) ───────────────────────────────
const layout = SINGLE_CELL_POSITIONS
const conveyor = SINGLE_CELL_CONVEYOR
const flowCfg = { ...SINGLE_CELL_FLOW }
// The cell declaration is independent from the Vue scene and can be reused by future editors.
const equipmentRegistry = createSingleConveyorEquipmentRegistry()

// ── Robot catalog (selection drives the scene, never a rewrite) ────
const robotCatalog = createDefaultRobotCatalog()
const selectedRobotId = ref(DEFAULT_ROBOT_ID)
const catalogRobots = computed(() => robotCatalog.listRobots())
const catalogTools = computed(() => robotCatalog.listTools())
const selectedRobot = computed(() => robotCatalog.getRobot(selectedRobotId.value))
const selectedKinematics = computed(() => createRobotKinematics(selectedRobot.value))
const cellFrames = createSingleCellFrames()
const developerTarget = ref<WorkObjectTarget>(createCncTarget('approach'))
const stepMode = new StepModeController()
const stepCheckpoint = ref<LearningCheckpoint | null>(null)
const stepSpeed = ref(1)
const expertMode = ref(false)
const timeline = new TimelineRecorder()
const faults = new FaultController(timeline)
const timelineRevision = ref(0)
const expectedLearningActions = ['start', 'step-next', 'acknowledge', 'reset', 'retry']
function timelineContext(equipmentId = 'simulator-1'): TimelineContext {
  return { source: 'simulator', sessionId: bridge.ctx.sessionId ?? 'local-session', equipmentId, correlationId: bridge.ctx.correlationId ?? 'local-correlation' }
}
function refreshFaultPanel(): void { timelineRevision.value += 1 }

// ── Motion safety engine (rebuilt when the robot profile changes) ───
const safetyEngine = shallowRef<MotionSafetyEngine>(new MotionSafetyEngine(
  createSafetyRobotModel(selectedRobot.value),
  createSingleCellWorld(),
))
function rebuildSafetyEngine(): void {
  safetyEngine.value = new MotionSafetyEngine(
    createSafetyRobotModel(selectedRobot.value),
    createSingleCellWorld(),
  )
}

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
const dashMode = ref<BridgeMode>('offline')
const dashConnection = ref<ConnectionState>('disconnected')
const dashSessionStatus = ref<string | null>(null)

// ── Controller & workflow ──────────────────────────────────────────
const robotController = shallowRef<RobotController | null>(null)
let workflow: PalletMachiningWorkflow | null = null
let workflowUpdateHooked = false
let robotRuntime: RobotMotionRuntime | null = null
let cncRuntime: CncRuntime | null = null
let palletStationRuntime: PalletStationRuntime | null = null

function getCncRuntime(): CncRuntime | null {
  cncRuntime ??= cncRef.value ? new LegacyCncAdapter('cnc-1', cncRef.value) : null
  return cncRuntime
}

function getPalletStationRuntime(): PalletStationRuntime | null {
  palletStationRuntime ??= palletFeedRef.value ? new LegacyPalletStationAdapter('pallet-station-1', palletFeedRef.value) : null
  return palletStationRuntime
}

// ── Orchestration bridge ───────────────────────────────────────────
const bridge = new SimulatorOrchestrationBridge()
faults.onPauseRequested = () => bridge.pause(() => workflow?.pause())
faults.onRetryRequested = () => bridge.resume(() => workflow?.resume())

onMounted(() => {
  bridge.onModeChanged = (mode) => { dashMode.value = mode }
  bridge.onConnectionStateChanged = (state) => { dashConnection.value = state }
  bridge.onSessionStatusChanged = (status) => { dashSessionStatus.value = status }
  bridge.init()
  // React to external (server-driven) state changes
  bridge.onExternalPause = () => workflow?.pause()
  bridge.onExternalResume = () => workflow?.resume()
  bridge.onExternalStop = () => workflow?.stop()
})
onBeforeUnmount(() => bridge.dispose())

function onControllerReady(controller: RobotController) {
  robotController.value = controller
  robotRuntime = new LegacyRobotAdapter('robot-1', controller)
  ensureWorkflow()
}

// ── Workflow creation (lazy, once) ─────────────────────────────────

function ensureWorkflow(): PalletMachiningWorkflow | null {
  if (workflow) return workflow
  const ctrl = robotRuntime
  if (!ctrl) return null

  // The adapters isolate the workflow from Vue component implementation details.
  const callbacks: PalletWorkflowCallbacks = {
    openCNCDoor: () => getCncRuntime()?.openForLoad(),
    startCNCMachining: () => getCncRuntime()?.startMachining(),
    cncUnloadComplete: () => getCncRuntime()?.completeUnload(),
    getCNCState: () => getCncRuntime()?.getMachineState() ?? 'IDLE',
    hideSlotPart: (palletId, row, col) => getPalletStationRuntime()?.setSlotVisible(palletId, row, col, false),
    showSlotPart: (palletId, row, col) => getPalletStationRuntime()?.setSlotVisible(palletId, row, col, true),
  }

  workflow = new PalletMachiningWorkflow(ctrl, callbacks, undefined, safetyEngine.value)
  workflow.setSpeedMultiplier(stepSpeed.value)

  workflow.onPhaseChanged = (phase) => {
    dashPhase.value = phase
    syncDashboard()
    timeline.record('state-transition', 'info', timelineContext('robot-1'), { to: phase })
    refreshFaultPanel()
    if (stepMode.observe(phase)) {
      timeline.record('telemetry', 'info', timelineContext('robot-1'), { event: 'learning-checkpoint', phase })
      refreshFaultPanel()
      stepCheckpoint.value = stepMode.current
      workflow?.pause()
    }
  }
  workflow.onRunStateChanged = (s) => {
    dashRunState.value = s
    syncDashboard()
    timeline.record('state-transition', 'info', timelineContext(), { to: s })
    refreshFaultPanel()
  }
  workflow.onSlotComplete = () => {
    syncDashboard()
  }
  workflow.onPalletComplete = () => {
    syncDashboard()
  }
  workflow.onTargetChanged = (target) => { developerTarget.value = target }

  // Bind bridge AFTER dashboard hooks are set so it can chain them
  bridge.bindWorkflow(workflow)

  // Hook workflow.update() into the controller's frame loop (once).
  if (!workflowUpdateHooked) {
    workflowUpdateHooked = true
    const visualController = robotController.value
    if (!visualController) return workflow
    const origUpdate = visualController.update.bind(visualController)
    visualController.update = (time: number) => {
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

  logDashboardSnapshot({
    runState: dashRunState.value,
    phase: dashPhase.value,
    palletId: dashPalletId.value,
    materialType: dashMaterial.value,
    currentRow: dashRow.value,
    currentCol: dashCol.value,
    machinedCount: dashCompleted.value,
    remainingCount: dashRemaining.value,
    totalCount: dashTotal.value,
    progressPercent: dashProgress.value,
    cncState: dashCncState.value,
    activeJobId: bridge.ctx.jobId,
    activeSessionId: bridge.ctx.sessionId,
  })
}

// ── Dashboard event handlers ───────────────────────────────────────

function handleStart(): void {
  const wf = ensureWorkflow()
  if (!wf) return
  const pallet = getPalletStationRuntime()?.getFirstStoppedPallet()
  if (!pallet) return
  timeline.record('command', 'info', timelineContext(), { command: 'start' })
  refreshFaultPanel()
  safetyEngine.value.updatePalletObstacle(pallet.worldX)
  bridge.start(pallet, (p) => {
    wf.start(p)
    syncDashboard()
  })
}

function handlePause(): void {
  timeline.record('command', 'info', timelineContext(), { command: 'pause' }); refreshFaultPanel()
  bridge.pause(() => workflow?.pause())
}

function handleResume(): void {
  timeline.record('command', 'info', timelineContext(), { command: 'resume' }); refreshFaultPanel()
  bridge.resume(() => workflow?.resume())
}

function handleStop(): void {
  timeline.record('command', 'warning', timelineContext(), { command: 'stop' }); refreshFaultPanel()
  bridge.stop(() => workflow?.stop())
}

function handleReset(): void {
  timeline.record('command', 'info', timelineContext(), { command: 'reset' }); refreshFaultPanel()
  bridge.reset()
  workflow?.reset()
  safetyEngine.value.updatePalletObstacle(null)
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
  dashSessionStatus.value = null
}

function injectFault(type: FaultType): void {
  const definition = getFaultDefinition(type)
  faults.inject(definition, 'instructor', timelineContext(definition.equipmentId))
  refreshFaultPanel()
}

function actOnFault(id: string, action: FaultAction): void {
  try { faults.act(id, action, timelineContext()); refreshFaultPanel() } catch (error) { console.warn('[Fault lab]', error) }
}

// ── Robot profile selection ────────────────────────────────────────

function selectRobot(id: string): void {
  if (id === selectedRobotId.value) return

  // Rebuild the runtime for the new profile (no scene rewrite — the same
  // ScaledRobotComponent re-mounts with the new definition and emits a
  // fresh controller).
  bridge.reset()
  workflow?.reset()
  workflow = null
  workflowUpdateHooked = false
  robotController.value = null
  robotRuntime = null
  cncRuntime = null
  palletStationRuntime = null

  selectedRobotId.value = id
  rebuildSafetyEngine()

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

function toggleStepMode(enabled: boolean): void {
  if (enabled) {
    stepMode.enable()
    if (workflow?.runState === 'running') bridge.pause(() => workflow?.pause())
  } else {
    stepMode.disable()
    stepCheckpoint.value = null
    if (workflow?.runState === 'paused') bridge.resume(() => workflow?.resume())
  }
}

function advanceStep(): void {
  if (!stepMode.next()) return
  timeline.record('command', 'info', timelineContext(), { command: 'step-next' })
  refreshFaultPanel()
  bridge.resume(() => workflow?.resume())
}

function setStepSpeed(speed: number): void {
  stepSpeed.value = speed
  workflow?.setSpeedMultiplier(speed)
}

function showPreviousExplanation(): void {
  stepCheckpoint.value = stepMode.previous
  timeline.record('command', 'info', timelineContext(), { command: 'hint' })
  refreshFaultPanel()
}

function restartGuidedRun(): void {
  stepMode.restart()
  stepCheckpoint.value = null
  handleReset()
}

function instructorResetScenario(): void {
  timeline.record('command', 'warning', timelineContext(), { command: 'instructor-reset-scenario' })
  refreshFaultPanel()
  restartGuidedRun()
}

// Attempt to create workflow when pallet feed ref becomes available
watch(
  () => palletFeedRef.value,
  () => ensureWorkflow(),
)
</script>
