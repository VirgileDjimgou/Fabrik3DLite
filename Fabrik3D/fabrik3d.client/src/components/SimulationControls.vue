<template>
  <div v-if="controller" class="sim-controls">
    <h3>Simulation</h3>

    <div class="btn-row">
      <button @click="goHome">Home</button>
      <button @click="runPickPlace" :disabled="pickPlaceActive">Pick &amp; Place</button>
    </div>

    <p v-if="pickPlacePhase !== 'idle' && pickPlacePhase !== 'done'" class="status">
      Phase: <strong>{{ pickPlacePhase }}</strong>
    </p>

    <div class="section">
      <label>Move duration (s)</label>
      <input v-model.number="moveDuration" type="number" min="0.2" max="5" step="0.1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RobotController } from '../simulation/RobotController'
import { PickPlacePlanner, type PickPlacePhase } from '../simulation/PickPlacePlanner'

const props = defineProps<{
  controller: RobotController | null
}>()

const moveDuration = ref(1.0)
const pickPlacePhase = ref<PickPlacePhase>('idle')
const pickPlaceActive = ref(false)

let planner: PickPlacePlanner | null = null

function goHome() {
  props.controller?.moveJoints([0, 0, 0, 0, 0, 0], moveDuration.value)
}

function runPickPlace() {
  if (!props.controller || pickPlaceActive.value) return
  pickPlaceActive.value = true

  planner = new PickPlacePlanner(props.controller, {
    abovePickAngles: [0.8, -0.2, 0.3, 0, 0, 0],
    pickAngles: [0.8, 0.1, 0.5, 0, -0.3, 0],
    abovePlaceAngles: [-0.8, -0.2, 0.3, 0, 0, 0],
    placeAngles: [-0.8, 0.1, 0.5, 0, -0.3, 0],
    moveDuration: moveDuration.value,
    gripDuration: 0.3,
  })

  planner.onCycleComplete = () => {
    pickPlaceActive.value = false
    pickPlacePhase.value = 'done'
    planner = null
  }

  planner.start()
  updatePhase()
}

function updatePhase() {
  if (!planner) return
  planner.update()
  if (!planner) return          // ← erneuter Guard nach update()
  pickPlacePhase.value = planner.phase
  if (planner.phase !== 'done') {
    requestAnimationFrame(updatePhase)
  }
}
</script>

<style scoped>
.sim-controls {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(26, 26, 46, 0.9);
  color: #f0f0f0;
  padding: 1rem;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.85rem;
  z-index: 20;
  min-width: 200px;
}

.sim-controls h3 {
  margin: 0 0 0.75rem;
  color: #ff6600;
  font-size: 1rem;
}

.btn-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.btn-row button {
  padding: 0.4rem 0.8rem;
  background: #ff6600;
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
  background: #e55d00;
}

.status {
  margin: 0.5rem 0;
  color: #aaa;
}

.section {
  margin-top: 0.5rem;
}

.section label {
  display: block;
  margin-bottom: 0.25rem;
  color: #ccc;
}

.section input {
  width: 80px;
  padding: 0.25rem 0.4rem;
  background: #2a2a3e;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  font-family: inherit;
}
</style>
