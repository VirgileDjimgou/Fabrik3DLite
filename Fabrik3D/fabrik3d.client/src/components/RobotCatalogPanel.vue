<template>
  <div class="robot-catalog-panel" :style="panelStyle">
    <h3 class="drag-handle" @pointerdown="beginDrag"><span aria-hidden="true">⠿</span> Robot Profile</h3>

    <div class="robot-list">
      <button
        v-for="robot in robots"
        :key="robot.id"
        class="robot-option"
        :class="{ selected: robot.id === selectedId }"
        type="button"
        :data-robot-id="robot.id"
        @click="$emit('select', robot.id)"
      >
        <span class="robot-name">{{ robot.name }}</span>
        <span class="robot-meta">{{ formatPayload(robot.payloadKg) }} · {{ formatReach(robot.reachMeters) }}</span>
      </button>
    </div>

    <div v-if="selected" class="robot-details" :data-selected-robot="selected.id">
      <div class="detail-row"><span class="label">{{ t('robot.payload') }}</span><span class="value">{{ formatPayload(selected.payloadKg) }}</span></div>
      <div class="detail-row"><span class="label">{{ t('robot.reach') }}</span><span class="value">{{ formatReach(selected.reachMeters) }}</span></div>
      <div class="detail-row"><span class="label">{{ t('robot.controller') }}</span><span class="value">{{ selected.controllerProfile }}</span></div>
      <div class="detail-row"><span class="label">{{ t('robot.joints') }}</span><span class="value">{{ selected.joints.length }}</span></div>
      <div v-if="selected.vendor?.vendor" class="detail-row">
        <span class="label">{{ t('robot.vendor') }}</span><span class="value">{{ selected.vendor.vendor }} · {{ selected.vendor.family }}</span>
      </div>
      <p v-if="selected.vendor?.note" class="vendor-note">{{ selected.vendor.note }}</p>

      <div v-if="tools.length" class="tool-block">
        <span class="label">{{ t('robot.compatibleTools') }}</span>
        <ul class="tool-list">
          <li v-for="tool in tools" :key="tool.id">
            {{ tool.name }}
            <span class="tool-compat" :class="{ ok: toolFits(selected, tool) }">
              {{ toolFits(selected, tool) ? t('robot.compatible') : t('robot.payloadLow') }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RobotDefinition, ToolDefinition } from '../robot/catalog'
import { useDraggableOverlay } from '../composables/useDraggableOverlay'
import { useSimulatorI18n } from '../i18n/simulator'

const props = defineProps<{
  robots: RobotDefinition[]
  selectedId: string
  tools: ToolDefinition[]
}>()

const { panelStyle, beginDrag } = useDraggableOverlay('fabrik3d:panel:robot-profile', { x: 16, y: 230 })
const { t } = useSimulatorI18n()

defineEmits<{
  (e: 'select', id: string): void
}>()

const selected = computed(() => props.robots.find((robot) => robot.id === props.selectedId) ?? null)

function formatPayload(kg: number): string { return `${kg} kg` }
function formatReach(meters: number): string { return `${meters} m` }

function toolFits(robot: RobotDefinition, tool: ToolDefinition): boolean {
  return robot.payloadKg >= tool.massKg + tool.workingPayloadKg
}
</script>

<style scoped>
.robot-catalog-panel {
  background: rgba(16, 16, 32, 0.94);
  color: #e0e0e0;
  padding: 1rem 1.1rem;
  border-radius: 10px;
  font-family: 'Segoe UI', monospace, sans-serif;
  font-size: 0.82rem;
  z-index: 30;
  min-width: 230px;
  max-width: 300px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 200, 120, 0.15);
}
.robot-catalog-panel h3 {
  margin: 0 0 0.7rem;
  color: #00cc88;
  font-size: 0.95rem;
  letter-spacing: 0.03em;
}
.drag-handle { cursor: grab; user-select: none; }
.drag-handle:active { cursor: grabbing; }
.robot-list { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.7rem; }
.robot-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  color: #ddd;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.78rem;
  text-align: left;
}
.robot-option:hover { background: rgba(0, 200, 120, 0.12); }
.robot-option.selected { border-color: #00cc88; background: rgba(0, 200, 120, 0.16); }
.robot-name { font-weight: 600; }
.robot-meta { color: #8899aa; font-size: 0.7rem; }
.robot-details { border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.55rem; }
.detail-row { display: flex; justify-content: space-between; padding: 0.12rem 0; }
.detail-row .label { color: #888; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.04em; }
.detail-row .value { color: #fff; font-weight: 500; }
.vendor-note { margin: 0.4rem 0 0; color: #8899aa; font-size: 0.72rem; }
.tool-block { margin-top: 0.5rem; }
.tool-list { margin: 0.3rem 0 0; padding: 0; list-style: none; }
.tool-list li { display: flex; justify-content: space-between; padding: 0.1rem 0; color: #ccc; }
.tool-compat { font-size: 0.68rem; }
.tool-compat.ok { color: #44dd88; }
.tool-compat:not(.ok) { color: #ff7766; }
</style>
