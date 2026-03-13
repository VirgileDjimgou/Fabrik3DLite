<template>
  <div class="dashboard">
    <h3>🏭 Pallet Machining</h3>

    <!-- ── Controls ──────────────────────────────────── -->
    <div class="btn-row">
      <button @click="$emit('start')" :disabled="runState === 'running'">▶ Start</button>
      <button @click="$emit('pause')" :disabled="runState !== 'running'">⏸ Pause</button>
      <button @click="$emit('resume')" :disabled="runState !== 'paused'">⏵ Resume</button>
      <button @click="$emit('stop')" :disabled="runState === 'idle' || runState === 'complete'">⏹ Stop</button>
      <button @click="$emit('reset')" class="btn-reset">↺ Reset</button>
    </div>

    <!-- ── Run state indicator ───────────────────────── -->
    <div class="state-bar" :class="runState">
      {{ stateLabel }}
    </div>

    <!-- ── Phase ─────────────────────────────────────── -->
    <div class="section">
      <label>Phase</label>
      <span class="value phase-value">{{ phaseLabel }}</span>
    </div>

    <!-- ── Pallet info ───────────────────────────────── -->
    <div class="section" v-if="palletId">
      <label>Pallet</label>
      <span class="value">{{ palletId }}</span>
    </div>
    <div class="section" v-if="materialType">
      <label>Material</label>
      <span class="value">{{ materialType }}</span>
    </div>

    <!-- ── Current slot ──────────────────────────────── -->
    <div class="section">
      <label>Current slot</label>
      <span class="value">
        {{ runState === 'idle' ? '—' : `R${currentRow} C${currentCol}` }}
      </span>
    </div>

    <!-- ── Slot state ────────────────────────────────── -->
    <div class="section" v-if="runState !== 'idle'">
      <label>Part state</label>
      <span class="value" :class="partStateClass">{{ partStateLabel }}</span>
    </div>

    <!-- ── Metrics ───────────────────────────────────── -->
    <div class="metrics">
      <div class="metric">
        <span class="metric-val">{{ slotsCompleted }}</span>
        <span class="metric-lbl">Machined</span>
      </div>
      <div class="metric">
        <span class="metric-val">{{ remainingSlots }}</span>
        <span class="metric-lbl">Remaining</span>
      </div>
      <div class="metric">
        <span class="metric-val">{{ totalSlots }}</span>
        <span class="metric-lbl">Total</span>
      </div>
    </div>

    <!-- ── Progress bar ──────────────────────────────── -->
    <div class="progress-wrap">
      <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
      <span class="progress-text">{{ progressPercent }}%</span>
    </div>

    <!-- ── CNC state ─────────────────────────────────── -->
    <div class="section">
      <label>CNC</label>
      <span class="value">{{ cncState }}</span>
    </div>

    <!-- ── Orchestration context ─────────────────────── -->
    <div class="section" v-if="jobId">
      <label>Job</label>
      <span class="value orchestration-id">{{ jobId.slice(-6) }}</span>
    </div>
    <div class="section" v-if="sessionId">
      <label>Session</label>
      <span class="value orchestration-id">{{ sessionId.slice(-6) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PalletWorkflowPhase, WorkflowRunState } from '../simulation/PalletMachiningWorkflow'

const props = withDefaults(defineProps<{
  runState: WorkflowRunState
  phase: PalletWorkflowPhase
  palletId: string
  materialType: string
  currentRow: number
  currentCol: number
  slotsCompleted: number
  remainingSlots: number
  totalSlots: number
  progressPercent: number
  cncState: string
  jobId?: string
  sessionId?: string
}>(), {
  runState: 'idle',
  phase: 'IDLE',
  palletId: '',
  materialType: '',
  currentRow: 0,
  currentCol: 0,
  slotsCompleted: 0,
  remainingSlots: 0,
  totalSlots: 0,
  progressPercent: 0,
  cncState: 'IDLE',
  jobId: '',
  sessionId: '',
})

defineEmits<{
  (e: 'start'): void
  (e: 'pause'): void
  (e: 'resume'): void
  (e: 'stop'): void
  (e: 'reset'): void
}>()

const STATE_LABELS: Record<WorkflowRunState, string> = {
  idle: '⏹ Idle',
  running: '▶ Running',
  paused: '⏸ Paused',
  stopped: '⏹ Stopped',
  complete: '✓ Complete',
}
const stateLabel = computed(() => STATE_LABELS[props.runState])

const PHASE_LABELS: Record<PalletWorkflowPhase, string> = {
  IDLE: 'Idle',
  SELECT_NEXT_SLOT: 'Selecting next slot',
  MOVE_ABOVE_PALLET_SLOT: 'Moving above pallet',
  DESCEND_TO_PICK: 'Descending to part',
  PICK_PART: 'Gripping part',
  LIFT_FROM_PALLET: 'Lifting from pallet',
  MOVE_TO_CNC_APPROACH: 'Moving to CNC',
  OPEN_CNC_DOOR: 'Opening CNC door',
  MOVE_TO_CNC_INSERT: 'Inserting into CNC',
  LOAD_PART: 'Releasing in CNC',
  RETRACT_FROM_CNC: 'Retracting from CNC',
  CLOSE_CNC_DOOR: 'Closing CNC door',
  MACHINING: 'Machining…',
  OPEN_CNC_DOOR_RETRIEVE: 'Moving to retrieve',
  MOVE_TO_CNC_RETRIEVE: 'Reaching into CNC',
  RETRIEVE_PART: 'Gripping machined part',
  LIFT_FROM_CNC: 'Lifting from CNC',
  MOVE_ABOVE_ORIGIN_SLOT: 'Returning to pallet',
  DESCEND_TO_ORIGIN_SLOT: 'Descending to slot',
  PLACE_PART_BACK: 'Placing machined part',
  LIFT_AFTER_PLACE: 'Lifting after place',
  NEXT_SLOT: 'Advancing…',
  COMPLETE: 'Complete',
}
const phaseLabel = computed(() => PHASE_LABELS[props.phase])

const partStateLabel = computed(() => {
  const p = props.phase
  if (p === 'IDLE' || p === 'SELECT_NEXT_SLOT' || p === 'COMPLETE' || p === 'NEXT_SLOT') return '—'
  if (p === 'MOVE_ABOVE_PALLET_SLOT' || p === 'DESCEND_TO_PICK') return 'raw'
  if (p === 'PICK_PART' || p === 'LIFT_FROM_PALLET') return 'picked'
  if (p === 'MOVE_TO_CNC_APPROACH' || p === 'OPEN_CNC_DOOR' || p === 'MOVE_TO_CNC_INSERT' || p === 'LOAD_PART') return 'loading'
  if (p === 'RETRACT_FROM_CNC' || p === 'CLOSE_CNC_DOOR' || p === 'MACHINING') return 'in CNC'
  if (p === 'OPEN_CNC_DOOR_RETRIEVE' || p === 'MOVE_TO_CNC_RETRIEVE' || p === 'RETRIEVE_PART' || p === 'LIFT_FROM_CNC') return 'machined'
  if (p === 'MOVE_ABOVE_ORIGIN_SLOT' || p === 'DESCEND_TO_ORIGIN_SLOT' || p === 'PLACE_PART_BACK' || p === 'LIFT_AFTER_PLACE') return 'returning'
  return '—'
})

const partStateClass = computed(() => {
  const s = partStateLabel.value
  if (s === 'picked' || s === 'loading') return 'state-active'
  if (s === 'in CNC') return 'state-cnc'
  if (s === 'machined' || s === 'returning') return 'state-done'
  return ''
})
</script>

<style scoped>
.dashboard {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(16, 16, 32, 0.94);
  color: #e0e0e0;
  padding: 1rem 1.1rem;
  border-radius: 10px;
  font-family: 'Segoe UI', monospace, sans-serif;
  font-size: 0.82rem;
  z-index: 30;
  min-width: 240px;
  max-width: 280px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 200, 120, 0.15);
}
.dashboard h3 {
  margin: 0 0 0.7rem;
  color: #00cc88;
  font-size: 0.95rem;
  letter-spacing: 0.03em;
}

/* ── Buttons ──────────────────────────────── */
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.7rem;
}
.btn-row button {
  padding: 0.32rem 0.55rem;
  background: #00aa66;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.78rem;
}
.btn-row button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-row button:hover:not(:disabled) {
  background: #00cc77;
}
.btn-reset {
  background: #664422 !important;
}
.btn-reset:hover:not(:disabled) {
  background: #885533 !important;
}

/* ── State bar ────────────────────────────── */
.state-bar {
  text-align: center;
  padding: 0.3rem;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.82rem;
  margin-bottom: 0.65rem;
  background: rgba(80, 80, 80, 0.4);
}
.state-bar.running  { background: rgba(0, 180, 100, 0.25); color: #00ee88; }
.state-bar.paused   { background: rgba(200, 180, 0, 0.2);  color: #eedd44; }
.state-bar.stopped  { background: rgba(200, 60, 60, 0.2);  color: #ff7766; }
.state-bar.complete { background: rgba(0, 120, 200, 0.2);  color: #44bbff; }

/* ── Sections ─────────────────────────────── */
.section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.18rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.section label {
  color: #888;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.value {
  color: #ddd;
  font-weight: 500;
}
.phase-value {
  color: #aaccff;
}
.state-active { color: #ffcc44; }
.state-cnc    { color: #ff6644; }
.state-done   { color: #44dd88; }
.orchestration-id { font-family: monospace; font-size: 0.72rem; color: #8899aa; }

/* ── Metrics ──────────────────────────────── */
.metrics {
  display: flex;
  justify-content: space-between;
  margin: 0.65rem 0 0.5rem;
  gap: 0.3rem;
}
.metric {
  text-align: center;
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 5px;
  padding: 0.4rem 0.2rem;
}
.metric-val {
  display: block;
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
}
.metric-lbl {
  font-size: 0.68rem;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* ── Progress bar ─────────────────────────── */
.progress-wrap {
  position: relative;
  height: 18px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  overflow: hidden;
  margin-bottom: 0.6rem;
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #00aa66, #00ccaa);
  border-radius: 9px;
  transition: width 0.4s ease;
}
.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
</style>
