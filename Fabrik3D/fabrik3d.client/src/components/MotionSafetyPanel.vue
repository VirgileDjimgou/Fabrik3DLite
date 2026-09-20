<template>
  <aside class="motion-safety-panel" :style="panelStyle" aria-label="Motion safety diagnostics">
    <header class="drag-handle" @pointerdown="beginDrag">
      <span aria-hidden="true">⠿</span>
      <span class="shield">&#9873;</span>
      <strong>{{ t('panel.safety') }}</strong>
    </header>

    <dl>
      <div><dt>{{ t('safety.reach') }}</dt><dd>{{ reach.toFixed(2) }} m</dd></div>
      <div><dt>{{ t('safety.checks') }}</dt><dd :class="{ disabled: !enabled }">{{ enabled ? t('safety.enabled') : t('safety.disabled') }}</dd></div>
      <div><dt>{{ t('safety.alarms') }}</dt><dd>{{ alarms.length }}</dd></div>
    </dl>

    <div v-if="alarms.length === 0" class="clear-note">{{ t('safety.clear') }}</div>
    <ul v-else class="alarm-list">
      <li v-for="alarm in alarms" :key="alarm.id" class="alarm" :class="severityClass(alarm.severity)">
        <span class="alarm-code">{{ alarm.code }}</span>
        <span class="alarm-meta">{{ alarm.equipmentId }} · {{ alarm.phase }}</span>
        <span class="alarm-msg">{{ alarm.message }}</span>
        <span v-if="alarm.distanceMeters != null" class="alarm-dist">{{ alarm.distanceMeters.toFixed(3) }} m</span>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { MotionSafetyEngine } from '../safety/motionSafety'
import type { SimulationAlarm } from '../safety/alarms'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { useSimulatorI18n } from '../i18n/simulator'

const props = defineProps<{
  engine: MotionSafetyEngine | null
}>()

const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:motion-safety', { x: Math.max(16, (window.innerWidth - 480) / 2), y: Math.max(16, window.innerHeight - 220) })
const { t } = useSimulatorI18n()

const reach = ref(0)
const enabled = ref(false)
const alarms = ref<SimulationAlarm[]>([])

let stopSync: (() => void) | null = null

function severityClass(severity: string): string {
  return severity === 'critical' || severity === 'error' ? 'error'
    : severity === 'warning' ? 'warning' : 'info'
}

watch(
  () => props.engine,
  (engine) => {
    stopSync?.()
    alarms.value = []
    if (!engine) { reach.value = 0; enabled.value = false; return }

    reach.value = engine.getReachEnvelopeMeters()
    enabled.value = engine.enabled
    alarms.value = [...engine.alarms.alarms].reverse().slice(0, 12)
    const handler = (alarm: SimulationAlarm) => {
      alarms.value = [alarm, ...alarms.value].slice(0, 12)
    }
    engine.alarms.onAlarm = handler
    stopSync = () => {
      if (engine.alarms.onAlarm === handler) engine.alarms.onAlarm = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => stopSync?.())
</script>

<style scoped>
.motion-safety-panel {
  z-index: 23;
  width: min(30rem, calc(100vw - 2rem));
  color: #e5edf2;
  background: rgb(10 22 31 / 92%);
  border: 1px solid #2c718b;
  border-radius: .35rem;
  padding: .6rem .8rem;
  font: .72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 28%);
}
header { display: flex; gap: .5rem; align-items: center; color: #b9eaff; }
.drag-handle { cursor: grab; user-select: none; }
.drag-handle:active { cursor: grabbing; }
.shield { color: #f7c948; font-weight: 800; }
dl { margin: .35rem 0 0; } dl div { display: flex; justify-content: space-between; gap: .75rem; border-top: 1px solid rgb(120 170 188 / 18%); padding: .2rem 0; }
dt { color: #82c9df; } dd { margin: 0; text-align: right; }
dd.disabled { color: #ff9a6b; }
.clear-note { margin-top: .35rem; color: #7ea6b5; }
.alarm-list { list-style: none; margin: .35rem 0 0; padding: 0; max-height: 8rem; overflow-y: auto; }
.alarm { display: grid; grid-template-columns: auto 1fr auto; gap: .35rem .6rem; border-top: 1px solid rgb(120 170 188 / 18%); padding: .25rem 0; }
.alarm-code { font-weight: 700; }
.alarm-meta { color: #9fc4d2; }
.alarm-msg { grid-column: 1 / -1; color: #cfe3ea; }
.alarm-dist { color: #f7c948; }
.alarm.error .alarm-code { color: #ff7a6b; }
.alarm.warning .alarm-code { color: #ffd166; }
.alarm.info .alarm-code { color: #82c9df; }
@media (max-width: 760px) { .motion-safety-panel { width: calc(100vw - 1rem); font-size: .66rem; } }
</style>
