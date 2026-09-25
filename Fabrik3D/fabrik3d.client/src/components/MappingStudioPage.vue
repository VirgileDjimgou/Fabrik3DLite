<template>
  <main class="mapping-page" data-view="mapping-studio">
    <header class="mapping-page-head">
      <h1>Fabrik3D — Signal mapping studio</h1>
      <p>
        Engineering surface for the CNC machine-tending reference cell.
        <strong>Simulated data only</strong> — applying a mapping never writes to physical equipment.
      </p>
    </header>
    <MappingStudio
      :registry="registry"
      :initial-file="file"
      :connector-health="connectorHealth"
      :apply-handler="applyHandler"
      :now="() => FIXED_NOW"
    />
  </main>
</template>

<script setup lang="ts">
import MappingStudio from './MappingStudio.vue'
import type { MappingApplyFeedback } from './MappingStudio.vue'
import { createSingleConveyorEquipmentRegistry } from '../equipment'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'
import {
  createReferenceCellSampleMapping,
  type ConnectorHealth,
  type MappingFileV1,
} from '../mapping'

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

const file: MappingFileV1 = createReferenceCellSampleMapping()

const connectorHealth: ConnectorHealth[] = [
  { protocol: 'opcua', state: 'Connected', healthy: true },
  { protocol: 'mqtt', state: 'Connected', healthy: true },
  { protocol: 'modbus', state: 'Connected', healthy: true },
]

// Deterministic fixture apply: validates the mapping and reports pending/success.
async function applyHandler(candidate: MappingFileV1): Promise<MappingApplyFeedback> {
  await Promise.resolve()
  const enabled = candidate.entries.filter((entry) => entry.enabled).length
  return { ok: true, message: `Applied ${enabled} mapping(s) to the connector fixtures (simulated).` }
}
</script>

<style scoped>
.mapping-page {
  min-height: 100vh;
  padding: 1.2rem;
  background: #0a161f;
  color: #dbe7ec;
  font-family: 'Segoe UI', ui-monospace, monospace;
}
.mapping-page-head h1 { margin: 0 0 .25rem; color: #9de3f6; font-size: 1.15rem; }
.mapping-page-head p { margin: 0 0 1rem; color: #8fb6c4; font-size: .82rem; }
.mapping-page-head strong { color: #ffd166; }
</style>
