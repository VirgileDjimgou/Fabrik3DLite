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
      :speed="conveyorBeltSpeed"
      :rotation-y="layout.conveyorRotationY"
      :sensor-active="conveyorSensorActive"
    />
    <PalletConveyorFeed
      ref="palletFeedRef"
      :flow-config="flowCfg"
      :conveyor-surface-y="conveyor.surfaceY"
      :conveyor-z="layout.conveyor[2]"
      @sensor-state="conveyorSensorActive = $event"
    />

    <!-- CNC machine centred in front of robot, door faces −Z -->
    <LargeCNCMachine
      ref="cncRef"
      :position="layout.cnc"
      :rotation-y="layout.cncRotationY"
      :machining-duration="5"
    />
    <SafetyGuardSystem :cnc-state="dashCncState" :online="dashConnection !== 'disconnected'" />
    <IndustrialInfrastructureSystem
      :cnc-state="dashCncState"
      :online="dashConnection !== 'disconnected'"
      :emergency-stop="safetyEmergencyStop"
      :gate-open="!safetyGateClosed"
    />

    <!-- Floor & scene setup -->
    <SingleConveyorFloor />
    <SingleConveyorSceneSetup />
  </ThreeScene>

  <!-- Docked panels preserve the 3D cell as the primary visual surface. -->
  <SimulationDock side="left" :label="t('dock.tools')">
    <details class="dock-panel" open>
      <summary>{{ t('panel.guided') }}</summary>
      <StepModePanel class="docked-panel"
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
    </details>
    <details class="dock-panel">
      <summary>{{ t('panel.robot') }}</summary>
      <RobotCatalogPanel class="docked-panel"
        :robots="catalogRobots"
        :selected-id="selectedRobotId"
        :tools="catalogTools"
        @select="selectRobot"
      />
    </details>
  </SimulationDock>

  <SimulationDock side="right" :label="t('dock.operations')">
    <details class="dock-panel" open>
      <summary>{{ t('panel.pallet') }}</summary>
      <PalletMachiningDashboard class="docked-panel"
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
        :command-error="commandError"
        @start="handleStart"
        @pause="handlePause"
        @resume="handleResume"
        @stop="handleStop"
        @reset="handleReset"
      />
    </details>
    <details class="dock-panel">
      <summary>{{ t('panel.faults') }}</summary>
      <FaultTimelinePanel class="docked-panel" :key="timelineRevision" :faults="faults.activeFaults" :entries="timeline.all" @inject="injectFault" @action="actOnFault" />
    </details>
  </SimulationDock>

  <SimulationDock side="bottom" :label="t('dock.learning')" :initial-open="false">
    <details class="dock-panel" open>
      <summary>{{ t('panel.learning') }}</summary>
      <LearningReportPanel class="docked-panel" :key="timelineRevision" :entries="timeline.all" :expected-actions="expectedLearningActions" scenario-id="pallet-processing" @reset-scenario="instructorResetScenario" />
    </details>
    <details v-if="expertMode" class="dock-panel" open>
      <summary>{{ t('panel.safety') }}</summary>
      <MotionSafetyPanel class="docked-panel" :engine="safetyEngine" />
    </details>
    <details v-if="expertMode" class="dock-panel">
      <summary>{{ t('panel.kinematics') }}</summary>
      <KinematicsDeveloperOverlay class="docked-panel"
        :controller="robotController"
        :model="selectedKinematics"
        :frames="cellFrames"
        :target="developerTarget"
      />
    </details>
    <details v-if="expertMode" class="dock-panel">
      <summary>{{ t('panel.signals') }}</summary>
      <SignalInspectorPanel class="docked-panel" :registry="signalRegistry" :binding="signalBinding" />
    </details>
    <details v-if="expertMode" class="dock-panel">
      <summary>{{ t('panel.faultLab') }}</summary>
      <FaultLabPanel
        class="docked-panel"
        :key="timelineRevision"
        :targets="faultLabTargets"
        :active-overlays="faultLab.activeOverlays"
        :authority-blocked="!cellAuthority.canCommand('simulator-1')"
        :feedback="faultLabFeedback"
        :feedback-tone="faultLabFeedbackTone"
        @activate="activateOverlay"
        @deactivate="clearOverlay"
      />
    </details>
  </SimulationDock>
</template>

<script setup lang="ts">
import { shallowRef, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ThreeScene from './ThreeScene.vue'
import ScaledRobotComponent from './ScaledRobotComponent.vue'
import ConveyorBelt from './ConveyorBelt.vue'
import PalletConveyorFeed from './PalletConveyorFeed.vue'
import LargeCNCMachine from './LargeCNCMachine.vue'
import SafetyGuardSystem from './SafetyGuardSystem.vue'
import IndustrialInfrastructureSystem from './IndustrialInfrastructureSystem.vue'
import SingleConveyorFloor from './SingleConveyorFloor.vue'
import SingleConveyorSceneSetup from './SingleConveyorSceneSetup.vue'
import PalletMachiningDashboard from './PalletMachiningDashboard.vue'
import RobotCatalogPanel from './RobotCatalogPanel.vue'
import KinematicsDeveloperOverlay from './KinematicsDeveloperOverlay.vue'
import MotionSafetyPanel from './MotionSafetyPanel.vue'
import StepModePanel from './StepModePanel.vue'
import FaultTimelinePanel from './FaultTimelinePanel.vue'
import LearningReportPanel from './LearningReportPanel.vue'
import SignalInspectorPanel from './SignalInspectorPanel.vue'
import SimulationDock from './SimulationDock.vue'
import { useSimulatorI18n } from '../i18n/simulator'
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
import { createSafetyRobotModel, MotionSafetyEngine, createSingleCellWorld, SafetyInterlockModel } from '../safety'
import { StepModeController, type LearningCheckpoint } from '../learning/StepModeController'
import { FaultController, getFaultDefinition, type FaultAction, type FaultType } from '../faults'
import { FaultLabController } from '../faults/FaultLabController'
import { REFERENCE_CELL_FAULT_TARGETS } from '../faults/faultTargets'
import type { OverlayFaultType } from '../faults/types'
import { TimelineRecorder, type TimelineContext } from '../timeline'
import { historianBridgeFromEnv } from '../historian'
import { postHistorianBatch } from '../services/orchestratorApi'
import { AuthorityStore } from '../twin/authority'
import FaultLabPanel from './FaultLabPanel.vue'
import {
  ReferenceCellSignalBinding,
  createReferenceCellSignalRegistry,
  REFERENCE_CELL_EQUIPMENT_IDS,
  type RobotSignalView,
} from '../signals'

// ── Layout (from centralised config) ───────────────────────────────
const layout = SINGLE_CELL_POSITIONS
const { t } = useSimulatorI18n()
const conveyor = SINGLE_CELL_CONVEYOR
const flowCfg = { ...SINGLE_CELL_FLOW }
const conveyorSensorActive = ref(false)
const conveyorBeltSpeed = ref(conveyor.speed)
// The cell declaration is independent from the Vue scene and can be reused by future editors.
const equipmentRegistry = createSingleConveyorEquipmentRegistry()
// Scene-scoped industrial signal registry and simulated safety interlock state.
const signalRegistry = createReferenceCellSignalRegistry(equipmentRegistry)
const signalBinding = shallowRef<ReferenceCellSignalBinding | null>(null)
const safetyInterlocks = new SafetyInterlockModel()
const safetyEmergencyStop = ref(false)
const safetyGateClosed = ref(true)
const commandError = ref('')

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
// S40 historian bridge: disabled unless VITE_HISTORIAN_ENABLED=true. When disabled it is a pure
// no-op and the local timeline remains the only record, so offline mode is unchanged.
const historian = historianBridgeFromEnv(postHistorianBatch)
const timeline = new TimelineRecorder(undefined, (entry) => { void historian.enqueueTimelineEntry(entry) })
const faults = new FaultController(timeline)
// S38 engineering fault lab: overlay faults on the simulated cell. The local
// authority store defaults to implicit local simulation; when an external
// controller owns the scope, injection is refused and reported.
const cellAuthority = new AuthorityStore('cell-1')
const faultLab = new FaultLabController(
  timeline,
  {
    canInject: () => cellAuthority.canCommand('simulator-1'),
    blockedReason: () => `Scope '${cellAuthority.snapshot().scope}' is controlled by ${cellAuthority.snapshot().mode}.`,
  },
  () => new Date().toISOString(),
  () => Date.now(),
)
const faultLabTargets = REFERENCE_CELL_FAULT_TARGETS
const faultLabFeedback = ref('')
const faultLabFeedbackTone = ref<'ok' | 'bad'>('ok')
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

// ── Industrial signal binding ──────────────────────────────────────
// Declared signals drive the same workflow/CNC/conveyor/safety paths as the
// operator controls; read-only signals are derived from real runtime state.

/** Counts the stopped pallet's slots in a given processing state (S39 material flow). */
function countSlots(status: 'raw' | 'machined'): number {
  const pallet = palletFeedRef.value?.getFirstStoppedPallet() ?? null
  if (!pallet) return 0
  let count = 0
  for (const row of pallet.slotStatus) {
    for (const cell of row) if (cell === status) count += 1
  }
  return count
}

function buildSignalBinding(): ReferenceCellSignalBinding {
  const robotView: RobotSignalView = {
    isServoOn: () => robotController.value !== null && !faultLab.isEquipmentFaulted('robot-1', 'actuator-jam') && !faultLab.isEquipmentFaulted('robot-1', 'communications-loss'),
    getWorkflowRunState: () => workflow?.runState ?? 'idle',
    getWorkflowPhase: () => workflow?.phase ?? 'IDLE',
    start: performStart,
    stop: performStop,
    reset: performReset,
  }
  return new ReferenceCellSignalBinding({
    registry: signalRegistry,
    equipment: REFERENCE_CELL_EQUIPMENT_IDS,
    overlays: {
      apply: (signalId, value, quality, safeValue, numeric) => {
        const result = faultLab.apply(signalId, value, quality, safeValue, numeric)
        return { value: result.value, quality: result.quality }
      },
      advanceTick: () => faultLab.advanceTick(),
      blocksCommand: (signalId) => faultLab.blocksCommand(signalId),
    },
    views: {
      robot: robotView,
      cnc: {
        getState: () => cncRef.value?.state ?? 'IDLE',
        getDoorState: () => cncRef.value?.getDoorState?.() ?? 'closed',
        commandDoor: (open) => cncRef.value?.commandDoor?.(open) ?? false,
        startCycle: () => {
          const cnc = cncRef.value
          if (!cnc || cnc.state !== 'LOADING') return false
          cnc.startMachining()
          return true
        },
        getPhase: () => cncRef.value?.getPhase?.() ?? 'IDLE',
        getDoorLocked: () => cncRef.value?.getDoorLocked?.() ?? false,
        getSpindleSpeed: () => cncRef.value?.getSpindleSpeed?.() ?? 0,
        isSpindleAtSpeed: () => cncRef.value?.isSpindleAtSpeed?.() ?? false,
        getFeedRate: () => cncRef.value?.getFeedRate?.() ?? 0,
        isFeedActive: () => cncRef.value?.isFeedActive?.() ?? false,
        isCoolantOn: () => cncRef.value?.isCoolantOn?.() ?? false,
        getCycleStep: () => cncRef.value?.getCycleStep?.() ?? 0,
        getFixtureClamped: () => cncRef.value?.getFixtureClamped?.() ?? false,
        getPartPresent: () => cncRef.value?.getPartPresent?.() ?? false,
      },
      conveyor: {
        isRunning: () => palletFeedRef.value?.isRunning() ?? false,
        getSpeedReference: () => palletFeedRef.value?.getSpeedReference() ?? conveyor.speed,
        getActualSpeed: () => palletFeedRef.value?.getActualSpeed() ?? 0,
        getPhotoeyeIn: () => palletFeedRef.value?.getPhotoeyeIn() ?? false,
        getPhotoeyeStation: () => palletFeedRef.value?.getPhotoeyeStation() ?? false,
        getEncoderPulses: () => palletFeedRef.value?.getEncoderPulses() ?? 0,
        setRunCommand: (run) => palletFeedRef.value?.setRunCommand(run) ?? false,
        setSpeedReference: (speed) => palletFeedRef.value?.setSpeedReference(speed) ?? false,
        getRawSlotsRemaining: () => countSlots('raw'),
        getMachinedSlots: () => countSlots('machined'),
      },
      safety: {
        isEmergencyStop: () => safetyInterlocks.getState().emergencyStop,
        isGateClosed: () => safetyInterlocks.getState().gateClosed,
        isGateLocked: () => safetyInterlocks.getState().gateLocked,
        isLightCurtainClear: () => safetyInterlocks.getState().lightCurtainClear,
        isScannerClear: () => safetyInterlocks.getState().scannerClear,
        isHealthy: () => safetyInterlocks.getState().safetyHealthy,
        reset: () => safetyInterlocks.reset(),
      },
      faults: {
        isActiveFor: (equipmentId) => faults.activeFaults.some((fault) => fault.equipmentId === equipmentId),
      },
    },
  })
}

/** Routes a UI command through the signal registry; returns false on rejection. */
function commandSignal(signalId: string, value: boolean | number, origin: 'operator' | 'simulation' = 'operator'): boolean {
  const binding = signalBinding.value
  if (!binding) {
    commandError.value = 'Signal binding is not ready.'
    return false
  }
  const result = binding.write(signalId, value, origin)
  commandError.value = result.accepted ? '' : result.message
  return result.accepted
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
onBeforeUnmount(() => {
  bridge.dispose()
  historian.stop()
  signalBinding.value?.dispose()
  signalRegistry.clear()
})

function onControllerReady(controller: RobotController) {
  robotController.value = controller
  robotRuntime = new LegacyRobotAdapter('robot-1', controller)
  signalBinding.value ??= buildSignalBinding()
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
      // refresh CNC state and publish the industrial signal snapshot each frame
      dashCncState.value = cncRef.value?.state ?? 'IDLE'
      const interlocks = safetyInterlocks.getState()
      safetyEmergencyStop.value = interlocks.emergencyStop
      safetyGateClosed.value = interlocks.gateClosed
      // The simulated E-stop aborts the CNC cycle; recovery requires an explicit reset.
      cncRef.value?.setEmergencyStop?.(interlocks.emergencyStop)
      signalBinding.value?.tick()
      conveyorBeltSpeed.value = palletFeedRef.value?.getActualSpeed() ?? 0
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
// Start/Stop/Reset are routed through the declared command signals; the
// performance implementations below stay the single source of behaviour.

function handleStart(): void { commandSignal('robot-1.Start', true) }
function handleStop(): void { commandSignal('robot-1.Stop', true) }
function handleReset(): void { commandSignal('robot-1.Reset', true) }

function performStart(): boolean {
  const wf = ensureWorkflow()
  if (!wf) return false
  // S38: an active equipment-layer fault refuses the actuator command and
  // reports the blocker, instead of silently starting.
  if (faultLab.isEquipmentFaulted('robot-1') || faultLab.isEquipmentFaulted('conveyor-1', 'motor-overload')) {
    commandError.value = 'Simulated equipment fault blocks the start command.'
    refreshFaultPanel()
    return false
  }
  const pallet = getPalletStationRuntime()?.getFirstStoppedPallet()
  if (!pallet) return false
  timeline.record('command', 'info', timelineContext(), { command: 'start' })
  refreshFaultPanel()
  safetyEngine.value.updatePalletObstacle(pallet.worldX)
  bridge.start(pallet, (p) => {
    wf.start(p)
    syncDashboard()
  })
  return true
}

function performStop(): boolean {
  const wf = ensureWorkflow()
  if (!wf) return false
  timeline.record('command', 'warning', timelineContext(), { command: 'stop' })
  refreshFaultPanel()
  bridge.stop(() => wf.stop())
  return true
}

function performReset(): boolean {
  timeline.record('command', 'info', timelineContext(), { command: 'reset' })
  refreshFaultPanel()
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
  return true
}

function handlePause(): void {
  timeline.record('command', 'info', timelineContext(), { command: 'pause' }); refreshFaultPanel()
  bridge.pause(() => workflow?.pause())
}

function handleResume(): void {
  timeline.record('command', 'info', timelineContext(), { command: 'resume' }); refreshFaultPanel()
  bridge.resume(() => workflow?.resume())
}

function injectFault(type: FaultType): void {
  const definition = getFaultDefinition(type)
  faults.inject(definition, 'instructor', timelineContext(definition.equipmentId))
  refreshFaultPanel()
}

function actOnFault(id: string, action: FaultAction): void {
  try { faults.act(id, action, timelineContext()); refreshFaultPanel() } catch (error) { console.warn('[Fault lab]', error) }
}

function activateOverlay(type: OverlayFaultType, equipmentId: string, signalId: string): void {
  const result = faultLab.activate({ type, equipmentId, signalIds: signalId ? [signalId] : [] }, timelineContext(equipmentId))
  if (!result.accepted) {
    faultLabFeedback.value = result.diagnostics[0]?.message ?? 'Injection refused.'
    faultLabFeedbackTone.value = 'bad'
  } else {
    faultLabFeedback.value = `Overlay '${type}' activated.`
    faultLabFeedbackTone.value = 'ok'
  }
  refreshFaultPanel()
}

function clearOverlay(id: string): void {
  const diagnostics = faultLab.deactivate(id, timelineContext())
  if (diagnostics.length > 0) {
    faultLabFeedback.value = diagnostics[0]!.message
    faultLabFeedbackTone.value = 'bad'
  } else {
    faultLabFeedback.value = 'Overlay cleared.'
    faultLabFeedbackTone.value = 'ok'
  }
  refreshFaultPanel()
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
