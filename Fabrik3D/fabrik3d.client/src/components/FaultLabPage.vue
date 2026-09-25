<template>
  <main class="fault-lab-page" data-view="fault-lab">
    <header class="page-head">
      <h1>Fabrik3D — Instructor fault lab</h1>
      <p>
        Engineering surface for the CNC machine-tending reference cell.
        <strong>Simulated data only</strong> — overlays never write to a connector or live machinery.
      </p>
    </header>

    <div class="layout">
      <FaultLabPanel
        :targets="targets"
        :active-overlays="activeOverlays"
        :authority-blocked="authorityBlocked"
        :feedback="feedback"
        :feedback-tone="feedbackTone"
        @activate="onActivate"
        @deactivate="onDeactivate"
      />

      <section class="monitor" data-fault-lab-monitor aria-label="Overlay effect monitor">
        <h5>Affected signals</h5>
        <table>
          <thead>
            <tr><th>Signal</th><th>Value</th><th>Quality</th></tr>
          </thead>
          <tbody>
            <tr v-for="sample in samples" :key="sample.signalId" :data-fault-lab-signal-row="sample.signalId">
              <td class="mono">{{ sample.signalId }}</td>
              <td class="mono" :data-fault-lab-value="sample.signalId">{{ formatValue(sample.value) }}</td>
              <td>
                <span class="quality" :class="`quality-${sample.quality}`" :data-fault-lab-quality="sample.signalId">{{ sample.quality }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import FaultLabPanel from './FaultLabPanel.vue'
import { createSingleConveyorEquipmentRegistry } from '../equipment'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'
import { FaultLabController, type FaultLabAuthority } from '../faults/FaultLabController'
import { REFERENCE_CELL_FAULT_TARGETS } from '../faults/faultTargets'
import type { OverlayFaultType } from '../faults/types'
import { TimelineRecorder } from '../timeline'

// Deterministic WebGL-free harness used by tests, docs and visual regression.
const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')
const params = new URLSearchParams(window.location.search)
const authorityBlocked = params.get('authority') === 'external'

const targets = REFERENCE_CELL_FAULT_TARGETS
const timeline = new TimelineRecorder(() => new Date(FIXED_NOW).toISOString())

// When ?authority=external the simulator is under external control, so injection
// is refused and the panel reports the blocker explicitly.
const authority: FaultLabAuthority = authorityBlocked
  ? { canInject: () => false, blockedReason: () => 'Scope is controlled by external-controller/connector-1.' }
  : { canInject: () => true, blockedReason: () => '' }

// A deterministic clock advances one tick per binding refresh so seeded patterns
// reproduce exactly across reloads.
const clock = { ms: FIXED_NOW }
const lab = new FaultLabController(timeline, authority, () => new Date(clock.ms).toISOString(), () => clock.ms)
const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => clock.ms })

const DEMO_VIEWS: ReferenceCellViews = {
  robot: { isServoOn: () => true, getWorkflowRunState: () => 'running', getWorkflowPhase: () => 'MOVE_TO_CNC_INSERT', start: () => true, stop: () => true, reset: () => true },
  cnc: { getState: () => 'MACHINING', getDoorState: () => 'closed', commandDoor: () => true, startCycle: () => true },
  conveyor: { isRunning: () => true, getSpeedReference: () => 0.35, getActualSpeed: () => 0.35, getPhotoeyeIn: () => false, getPhotoeyeStation: () => true, getEncoderPulses: () => 4_210, setRunCommand: () => true, setSpeedReference: () => true },
  safety: { isEmergencyStop: () => false, isGateClosed: () => true, isGateLocked: () => true, isLightCurtainClear: () => true, isScannerClear: () => true, isHealthy: () => true, reset: () => ({ accepted: true }) },
  faults: { isActiveFor: () => false },
}

const binding = new ReferenceCellSignalBinding({
  registry,
  equipment: REFERENCE_CELL_EQUIPMENT_IDS,
  views: DEMO_VIEWS,
  now: () => clock.ms,
  overlays: {
    apply: (signalId, value, quality, safeValue, numeric) => {
      const result = lab.apply(signalId, value, quality, safeValue, numeric)
      return { value: result.value, quality: result.quality }
    },
    advanceTick: () => lab.advanceTick(),
    blocksCommand: (signalId) => lab.blocksCommand(signalId),
  },
})

const revision = ref(0)
const feedback = ref('')
const feedbackTone = ref<'ok' | 'bad'>('ok')
const activeOverlays = computed(() => { revision.value; return [...lab.activeOverlays] })
const samples = computed(() => { revision.value; return [...registry.snapshot()] })

function refresh(): void {
  clock.ms = FIXED_NOW + revision.value * 1_000
  binding.tick()
  revision.value += 1
}

function onActivate(type: OverlayFaultType, equipmentId: string, signalId: string): void {
  const result = lab.activate({ type, equipmentId, signalIds: signalId ? [signalId] : [] }, {
    source: 'instructor', sessionId: 'fault-lab', equipmentId, correlationId: `fault-lab-${revision.value}`,
  })
  if (!result.accepted) {
    feedback.value = result.diagnostics[0]?.message ?? 'Injection refused.'
    feedbackTone.value = 'bad'
  } else {
    feedback.value = 'Overlay activated.'
    feedbackTone.value = 'ok'
  }
  refresh()
}

function onDeactivate(id: string): void {
  const diagnostics = lab.deactivate(id, { source: 'instructor', sessionId: 'fault-lab', equipmentId: 'conveyor-1', correlationId: `fault-lab-${revision.value}` })
  if (diagnostics.length > 0) {
    feedback.value = diagnostics[0]!.message
    feedbackTone.value = 'bad'
  } else {
    feedback.value = 'Overlay cleared.'
    feedbackTone.value = 'ok'
  }
  refresh()
}

function formatValue(value: boolean | number | string): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

onMounted(refresh)
</script>

<style scoped>
.fault-lab-page { min-height: 100vh; padding: 1.2rem; background: #0a161f; color: #dbe7ec; font-family: 'Segoe UI', ui-monospace, monospace; }
.page-head h1 { margin: 0 0 .25rem; color: #9de3f6; font-size: 1.15rem; }
.page-head p { margin: 0 0 1rem; color: #8fb6c4; font-size: .82rem; }
.page-head strong { color: #ffd166; }
.layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr); gap: .75rem; align-items: start; }
.monitor { border: 1px solid #23485a; border-radius: .3rem; padding: .5rem; background: #0d1f29; }
.monitor h5 { margin: 0 0 .35rem; color: #9de3f6; font-size: .75rem; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: #8fb6c4; text-transform: uppercase; letter-spacing: .04em; padding: .25rem .35rem; }
td { padding: .25rem .35rem; border-top: 1px solid rgb(255 255 255 / 5%); }
.mono { white-space: nowrap; }
.quality { padding: .05rem .3rem; border: 1px solid currentColor; border-radius: 999px; font-size: .66rem; font-weight: 800; text-transform: uppercase; }
.quality-good { color: #68dfa8; }
.quality-stale, .quality-uncertain { color: #ffd166; }
.quality-bad, .quality-invalid { color: #ff8080; }
@media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
