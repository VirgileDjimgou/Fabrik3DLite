<template>
  <!-- Renderless – deterministic CNC machining centre (S39).
       All state is owned by CncCycleMachine; this component only renders it. -->
</template>

<script setup lang="ts">
import { inject, watch, ref, onBeforeUnmount } from 'vue'
import { SCENE_CONTEXT_KEY, ANIMATION_LOOP_KEY } from '../composables/injectionKeys'
import {
  CncCycleMachine,
  timingsForMachiningDuration,
  type CncCyclePhase,
  type CncCycleSnapshot,
} from '../simulation/CncCycleMachine'
import { buildCncMachineVisual, type CncMachineVisual } from '../equipment/visuals/cncMachineVisual'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  /** Rotation around Y in radians. */
  rotationY?: number
  /** Duration of the simulated machining cycle (seconds). */
  machiningDuration?: number
}>(), {
  position: () => [0, 0, 0] as [number, number, number],
  rotationY: 0,
  machiningDuration: 5,
})

const emit = defineEmits<{
  (e: 'machining-complete'): void
}>()

const sceneCtx = inject(SCENE_CONTEXT_KEY)!
const animLoop = inject(ANIMATION_LOOP_KEY)!

type CNCState = 'IDLE' | 'LOADING' | 'MACHINING' | 'UNLOADING'
const state = ref<CNCState>('IDLE')

const machine = new CncCycleMachine(timingsForMachiningDuration(props.machiningDuration))
machine.onCycleComplete = () => emit('machining-complete')

let visual: CncMachineVisual | null = null
let online = true

function syncState(): void {
  const coarse = machine.coarseState
  if (state.value !== coarse) state.value = coarse
  if (visual) {
    visual.apply({
      doorPosition: machine.doorPosition,
      fixtureClamped: machine.fixtureClamped,
      spindleSpeed: machine.spindleSpeed,
      spindleAtSpeed: machine.spindleAtSpeed,
      feedActive: machine.feedActive,
      coolantOn: machine.coolantOn,
      coarseState: coarse,
      online,
    })
  }
}

watch(
  () => sceneCtx.value,
  (ctx) => {
    if (!ctx || visual) return
    visual = buildCncMachineVisual()
    visual.group.position.set(...props.position)
    visual.group.rotation.y = props.rotationY
    ctx.addObject(visual.group)
    syncState()

    animLoop.onFrame((_time, delta) => {
      machine.update(delta)
      syncState()
    })
  },
  { immediate: true },
)

// ── Public API (kept compatible with the pre-S39 interface) ────────
function loadPart(): void { machine.loadPart(); syncState() }
function startMachining(): void { machine.startMachining(); syncState() }
function unloadComplete(): void { machine.unloadComplete(); syncState() }

function getDoorState(): 'open' | 'closed' | 'moving' {
  if (machine.doorClosed) return 'closed'
  if (machine.doorOpen) return 'open'
  return 'moving'
}

function commandDoor(open: boolean): boolean {
  return machine.commandDoor(open)
}

// ── S39 diagnostics surface (read-only truth for signals/visuals) ──
function getPhase(): CncCyclePhase { return machine.phase }
function getCoarseState(): CNCState { return machine.coarseState }
function getSpindleSpeed(): number { return machine.spindleSpeed }
function getFeedRate(): number { return machine.feedRate }
function getDoorLocked(): boolean { return machine.doorLocked }
function isSpindleAtSpeed(): boolean { return machine.spindleAtSpeed }
function isFeedActive(): boolean { return machine.feedActive }
function isCoolantOn(): boolean { return machine.coolantOn }
function getCycleStep(): number { return machine.cycleStep }
function getFixtureClamped(): boolean { return machine.fixtureClamped }
function getPartPresent(): boolean { return machine.partPresent }
function snapshot(): CncCycleSnapshot { return machine.snapshot() }
function setEmergencyStop(active: boolean): void { machine.setEmergencyStop(active); syncState() }
function setFault(active: boolean): void { machine.setFault(active); syncState() }
function setOnline(value: boolean): void { online = value; syncState() }

defineExpose({
  loadPart, startMachining, unloadComplete, state, getDoorState, commandDoor,
  getPhase, getCoarseState, getSpindleSpeed, getFeedRate, getDoorLocked,
  isSpindleAtSpeed, isFeedActive, isCoolantOn, getCycleStep, getFixtureClamped,
  getPartPresent, snapshot, setEmergencyStop, setFault, setOnline,
})

onBeforeUnmount(() => {
  const ctx = sceneCtx.value
  if (ctx && visual) ctx.removeObject(visual.group)
  visual?.dispose()
  visual = null
})
</script>
