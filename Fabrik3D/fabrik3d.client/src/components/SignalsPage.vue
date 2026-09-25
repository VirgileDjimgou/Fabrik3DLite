<template>
  <main class="signals-page" data-view="signals">
    <header class="signals-header">
      <h1>Fabrik3D — Industrial I/O</h1>
      <p>
        Engineering monitor for the CNC machine-tending reference cell.
        <strong>Simulated data only</strong> — not connected to physical equipment.
      </p>
    </header>
    <SignalInspectorPanel :registry="registry" :binding="binding" :refresh-interval-ms="60_000" />
  </main>
</template>

<script setup lang="ts">
import SignalInspectorPanel from './SignalInspectorPanel.vue'
import { createSingleConveyorEquipmentRegistry } from '../equipment'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'

// Deterministic WebGL-free harness used by tests, docs and visual regression.
const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')

const DEMO_VIEWS: ReferenceCellViews = {
  robot: {
    isServoOn: () => true,
    getWorkflowRunState: () => 'running',
    getWorkflowPhase: () => 'MOVE_TO_CNC_INSERT',
    start: () => true,
    stop: () => true,
    reset: () => true,
  },
  cnc: {
    getState: () => 'MACHINING',
    getDoorState: () => 'closed',
    commandDoor: () => true,
    startCycle: () => true,
  },
  conveyor: {
    isRunning: () => true,
    getSpeedReference: () => 0.35,
    getActualSpeed: () => 0.35,
    getPhotoeyeIn: () => false,
    getPhotoeyeStation: () => true,
    getEncoderPulses: () => 4_210,
    setRunCommand: () => true,
    setSpeedReference: () => true,
  },
  safety: {
    isEmergencyStop: () => false,
    isGateClosed: () => true,
    isGateLocked: () => true,
    isLightCurtainClear: () => true,
    isScannerClear: () => true,
    isHealthy: () => true,
    reset: () => ({ accepted: true }),
  },
  faults: { isActiveFor: () => false },
}

const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => FIXED_NOW })
const binding = new ReferenceCellSignalBinding({
  registry,
  equipment: REFERENCE_CELL_EQUIPMENT_IDS,
  views: DEMO_VIEWS,
  now: () => FIXED_NOW,
})
binding.tick()
</script>

<style scoped>
.signals-page {
  min-height: 100vh;
  padding: 1.2rem;
  background: #0a161f;
  color: #dbe7ec;
  font-family: 'Segoe UI', ui-monospace, monospace;
}
.signals-header h1 { margin: 0 0 .25rem; color: #9de3f6; font-size: 1.15rem; }
.signals-header p { margin: 0 0 1rem; color: #8fb6c4; font-size: .82rem; }
.signals-header strong { color: #ffd166; }
</style>
