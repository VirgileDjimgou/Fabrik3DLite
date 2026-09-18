<template>
  <div class="scenario-lab" data-view="scenario">
    <header class="lab-header">
      <strong>Scenario Lab</strong>
    </header>

    <div class="scenario-list">
      <button
        v-for="scenario in SCENARIO_CATALOG"
        :key="scenario.id"
        type="button"
        :data-scenario="scenario.id"
        :class="{ selected: selectedId === scenario.id }"
        @click="selectScenario(scenario.id)"
      >
        <span class="level" :class="scenario.level">{{ scenario.level }}</span>
        {{ scenario.title.en }}
      </button>
    </div>

    <div v-if="selected" class="selected" data-selected-scenario>
      <h3>{{ selected.title.en }}</h3>
      <p class="explanation">{{ selected.explanation.en }}</p>
      <ul class="objectives">
        <li v-for="(o, i) in selected.learningObjectives" :key="i">{{ o.en }}</li>
      </ul>
      <button type="button" class="run" data-action="run-scenario" @click="run">Run scenario</button>
    </div>

    <div class="status" data-scenario-status-panel>
      <div>Status: <strong data-scenario-status>{{ state?.status ?? 'idle' }}</strong></div>
      <div>Progress: <span data-scenario-progress>{{ state?.progressPercent ?? 0 }}%</span></div>
      <div>Activity: <span data-scenario-activity>{{ state?.currentActivityId ?? '—' }}</span></div>
      <div v-if="state?.currentActivityId" class="instruction" data-scenario-instruction>
        {{ instructionText }}
      </div>
      <ul class="completed">
        <li v-for="id in state?.completedActivityIds ?? []" :key="id">✓ {{ id }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EquipmentRuntimeState, RobotMotionRuntime } from '../equipment/types'
import { SCENARIO_CATALOG, getScenario } from '../scenarios/catalog'
import { bindWorkflowEvents } from '../scenarios/workflowEvents'
import { ScenarioRunner } from '../scenarios/runner'
import type { ScenarioProgress } from '../scenarios/types'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from '../simulation/PalletMachiningWorkflow'
import { PALLET_HOME_POSE } from '../simulation/PalletWorkspaceTargets'
import type { PalletData } from '../simulation/PalletModels'

const selectedId = ref('pallet-processing')
const selected = computed(() => getScenario(selectedId.value))
const state = ref<ScenarioProgress | null>(null)

const instructionText = computed(() => {
  const activity = selected.value.activities.find((a) => a.id === state.value?.currentActivityId)
  return activity?.instruction.en ?? ''
})

function selectScenario(id: string): void {
  selectedId.value = id
  state.value = null
}

class FastAdapter implements RobotMotionRuntime {
  readonly equipmentId = 'robot-1'
  isMoving = false
  private joints = [...PALLET_HOME_POSE]
  moveJoints(targetAngles: number[], _duration?: number): void { this.joints = [...targetAngles] }
  enqueueMove(): void {}
  clearCommands(): void {}
  getJointAngles(): number[] { return [...this.joints] }
  getRuntimeState(): EquipmentRuntimeState { return { status: 'idle', updatedAt: new Date().toISOString() } }
}

function pallet(): PalletData {
  return {
    id: 'pallet-0', rows: 1, cols: 1, cavityShape: 'hex', materialType: 'hex-billet',
    occupied: [[true]], slotStatus: [['raw']], worldX: 0, state: 'stopped',
  }
}

function callbacks(): PalletWorkflowCallbacks {
  return {
    openCNCDoor: () => {}, startCNCMachining: () => {}, cncUnloadComplete: () => {},
    getCNCState: () => 'UNLOADING', hideSlotPart: () => {}, showSlotPart: () => {},
  }
}

function run(): void {
  const runner = new ScenarioRunner(getScenario(selectedId.value))
  runner.start()
  state.value = runner.getState()

  const workflow = new PalletMachiningWorkflow(new FastAdapter(), callbacks(), {
    travelDuration: 0, approachDuration: 0, gripDuration: 0, doorWait: 0, machiningDuration: 0,
  })
  bindWorkflowEvents(workflow, (event) => { runner.observe(event) })
  workflow.start(pallet())
  for (let i = 0; i < 500; i++) workflow.update()

  state.value = runner.getState()
}
</script>

<style scoped>
.scenario-lab { position: relative; width: 100vw; min-height: 100vh; background: #0c1419; color: #e5edf2; font: 0.82rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 1rem; box-sizing: border-box; }
.lab-header { margin-bottom: 0.8rem; color: #b9eaff; }
.scenario-list { display: flex; flex-direction: column; gap: 0.4rem; max-width: 32rem; }
.scenario-list button { display: flex; gap: 0.6rem; align-items: center; padding: 0.5rem 0.7rem; background: rgb(255 255 255 / 6%); border: 1px solid rgb(120 170 188 / 30%); border-radius: 5px; color: #dbe7ee; cursor: pointer; text-align: left; }
.scenario-list button.selected { border-color: #00cc88; background: rgb(0 200 120 / 14%); }
.level { text-transform: uppercase; font-size: 0.62rem; padding: 0.1rem 0.35rem; border-radius: 3px; }
.level.beginner { background: rgb(0 200 120 / 20%); color: #9ff0cf; }
.level.intermediate { background: rgb(255 200 90 / 18%); color: #ffe3a1; }
.level.advanced { background: rgb(255 90 70 / 22%); color: #ffb3a9; }
.selected { margin-top: 1rem; max-width: 32rem; }
.selected h3 { margin: 0 0 0.4rem; }
.explanation { color: #9fc4d2; }
.objectives { color: #bfd3dc; padding-left: 1.1rem; }
.run { margin-top: 0.6rem; padding: 0.45rem 1rem; background: #00aa66; border: none; border-radius: 5px; color: #06201a; font: inherit; font-weight: 700; cursor: pointer; }
.status { margin-top: 1rem; max-width: 32rem; padding: 0.7rem; border: 1px solid #2c718b; border-radius: 6px; background: rgb(10 22 31 / 92%); }
.instruction { margin-top: 0.4rem; color: #ffd166; }
.completed { color: #44dd88; padding-left: 1.1rem; }
</style>