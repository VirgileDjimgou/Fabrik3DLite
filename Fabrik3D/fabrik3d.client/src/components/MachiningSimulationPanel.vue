<template>
  <div v-if="controller" class="machining-panel">
    <h3>Machining Cell</h3>

    <div class="btn-row">
      <button @click="startSimulation" :disabled="isRunning">▶ Start</button>
      <button @click="stopSimulation" :disabled="!isRunning">⏹ Stop</button>
    </div>

    <p v-if="phase !== 'IDLE' && phase !== 'COMPLETE'" class="status">
      Phase: <strong>{{ phaseLabel }}</strong>
    </p>
    <p v-if="phase === 'COMPLETE'" class="status done">
      ✓ All parts processed ({{ partsCompleted }})
    </p>

    <div class="counter">
      Parts completed: <strong>{{ partsCompleted }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { MachiningWorkflow, type MachiningPhase } from '../simulation/MachiningWorkflow'
import type { RobotController } from '../simulation/RobotController'
import type { PartManager, MetalPartData, PartShape } from '../simulation/PartManager'

const props = defineProps<{
  controller: RobotController | null
  partManager: PartManager | null
  /** Open the CNC door (loadPart). */
  openCNCDoor: () => boolean
  /** Start CNC machining. */
  startCNCMachining: () => boolean
  /** Signal CNC unload complete. */
  cncUnloadComplete: () => void
  /** Query CNC state string. */
  getCNCState: () => string
  /** Get next free slot on the finished table. */
  getFinishedSlot: (shape: PartShape) => [number, number, number] | null
  /** Called when a part is visually picked. */
  onPartPicked: (part: MetalPartData) => void
  /** Called when a part is visually placed at a position. */
  onPartPlaced: (part: MetalPartData, pos: [number, number, number]) => void
  /** Called when a part appearance should change to machined. */
  onPartMachined: (part: MetalPartData) => void
}>()

const phase = ref<MachiningPhase>('IDLE')
const isRunning = ref(false)
const partsCompleted = ref(0)

let workflow: MachiningWorkflow | null = null
let rafId = 0

const PHASE_LABELS: Record<MachiningPhase, string> = {
  IDLE: 'Idle',
  MOVE_ABOVE_PICK: 'Moving above raw table',
  DESCEND_TO_PICK: 'Descending to part',
  PICK_PART: 'Gripping part',
  LIFT_FROM_PICK: 'Lifting from table',
  MOVE_TO_CNC_APPROACH: 'Moving to CNC',
  OPEN_CNC_DOOR: 'Opening CNC door',
  MOVE_TO_CNC_INSERT: 'Inserting into CNC',
  LOAD_PART: 'Releasing in CNC',
  RETRACT_FROM_CNC: 'Retracting from CNC',
  CLOSE_CNC_DOOR: 'Closing CNC door',
  MACHINING: 'Machining…',
  OPEN_CNC_DOOR_RETRIEVE: 'Moving to CNC',
  MOVE_TO_CNC_RETRIEVE: 'Reaching into CNC',
  RETRIEVE_PART: 'Gripping machined part',
  LIFT_FROM_CNC: 'Lifting from CNC',
  MOVE_TO_FINISHED_APPROACH: 'Moving to finished table',
  DESCEND_TO_FINISHED: 'Descending to table',
  PLACE_PART: 'Releasing part',
  LIFT_FROM_FINISHED: 'Lifting from table',
  COMPLETE: 'Complete',
}

const phaseLabel = ref(PHASE_LABELS.IDLE)

function startSimulation() {
  if (!props.controller || !props.partManager || isRunning.value) return

  workflow = new MachiningWorkflow(
    props.controller,
    props.partManager,
    {
      onPartPicked: props.onPartPicked,
      onPartPlaced: props.onPartPlaced,
      onPartMachined: props.onPartMachined,
      openCNCDoor: props.openCNCDoor,
      startCNCMachining: props.startCNCMachining,
      cncUnloadComplete: props.cncUnloadComplete,
      getCNCState: props.getCNCState,
      getFinishedSlot: props.getFinishedSlot,
    },
  )

  workflow.onPhaseChanged = (p) => {
    phase.value = p
    phaseLabel.value = PHASE_LABELS[p]
  }

  workflow.onCycleComplete = () => {
    partsCompleted.value = workflow?.partsCompleted ?? 0
  }

  workflow.onAllComplete = () => {
    isRunning.value = false
  }

  isRunning.value = true
  workflow.start()
  tick()
}

function stopSimulation() {
  workflow?.stop()
  isRunning.value = false
}

function tick() {
  if (!workflow || !isRunning.value) return
  workflow.update()
  rafId = requestAnimationFrame(tick)
}

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  workflow?.stop()
  workflow = null
})
</script>

<style scoped>
.machining-panel {
  position: absolute;
  top: 1rem;
  left: 14rem;
  background: rgba(26, 26, 46, 0.92);
  color: #f0f0f0;
  padding: 1rem;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.85rem;
  z-index: 20;
  min-width: 210px;
}

.machining-panel h3 {
  margin: 0 0 0.75rem;
  color: #00cc88;
  font-size: 1rem;
}

.btn-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.btn-row button {
  padding: 0.4rem 0.8rem;
  background: #00aa66;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
}

.btn-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-row button:hover:not(:disabled) {
  background: #009955;
}

.status {
  margin: 0.5rem 0;
  color: #aaa;
}

.status.done {
  color: #00cc88;
}

.counter {
  margin-top: 0.5rem;
  color: #ccc;
}
</style>
