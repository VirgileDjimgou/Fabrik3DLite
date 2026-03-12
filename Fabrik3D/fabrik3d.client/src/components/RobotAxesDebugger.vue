<template>
  <div v-if="controller" class="axes-debugger">
    <h3>Joint Control</h3>
    <div v-for="(label, i) in axisLabels" :key="i" class="axis-row">
      <label>{{ label }}</label>
      <input
        type="range"
        :min="limitsDeg[i]![0]"
        :max="limitsDeg[i]![1]"
        :value="anglesDeg[i]"
        step="1"
        @input="onSlider(i, $event)"
      />
      <span class="value">{{ anglesDeg[i]?.toFixed(1) }}°</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { RobotController } from '../simulation/RobotController'
import { DEFAULT_JOINT_LIMITS, AXIS_COUNT } from '../simulation/AxisLimits'

const props = defineProps<{ controller: RobotController | null }>()

const axisLabels = ['Axis 1 (Base)', 'Axis 2 (Shoulder)', 'Axis 3 (Elbow)', 'Axis 4 (Wrist Roll)', 'Axis 5 (Wrist Pitch)', 'Axis 6 (Wrist Yaw)']

const limitsDeg = DEFAULT_JOINT_LIMITS.map((l) => [
  (l.min * 180) / Math.PI,
  (l.max * 180) / Math.PI,
])

const anglesDeg = ref<number[]>(new Array(AXIS_COUNT).fill(0))

watchEffect(() => {
  if (props.controller) {
    anglesDeg.value = props.controller.jointAngles.map((a) => (a * 180) / Math.PI)
  }
})

function onSlider(axis: number, event: Event) {
  const val = parseFloat((event.target as HTMLInputElement).value)
  props.controller?.setJointAngle(axis, (val * Math.PI) / 180)
  anglesDeg.value[axis] = val
}
</script>

<style scoped>
.axes-debugger {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(26, 26, 46, 0.9);
  color: #f0f0f0;
  padding: 1rem;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.85rem;
  z-index: 20;
  min-width: 260px;
}

.axes-debugger h3 {
  margin: 0 0 0.75rem;
  color: #ff6600;
  font-size: 1rem;
}

.axis-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.axis-row label {
  width: 120px;
  flex-shrink: 0;
}

.axis-row input[type='range'] {
  flex: 1;
  accent-color: #ff6600;
}

.value {
  width: 55px;
  text-align: right;
}
</style>
