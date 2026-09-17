<template>
  <aside class="kinematics-overlay" aria-label="Kinematics developer overlay">
    <header>
      <span class="axis-marker">XYZ</span>
      <strong>Frames &amp; Kinematics</strong>
    </header>
    <p class="model">{{ model.id }} · {{ solverStatus }}</p>
    <dl>
      <div><dt>World / Cell</dt><dd>m · rad · s · kg</dd></div>
      <div><dt>Tool pose</dt><dd>{{ toolPose }}</dd></div>
      <div><dt>Target</dt><dd>{{ targetPose }}</dd></div>
    </dl>
    <details>
      <summary>Frames and joints</summary>
      <ul>
        <li v-for="frame in frames" :key="frame.id">{{ frame.kind }}: {{ frame.id }} → {{ frame.parentId ?? 'root' }}</li>
      </ul>
      <ol>
        <li v-for="(angle, index) in controller?.jointAngles ?? []" :key="index">J{{ index + 1 }}: {{ degrees(angle) }}°</li>
      </ol>
    </details>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RobotController } from '../simulation/RobotController'
import type { CoordinateFrame } from '../kinematics/frames'
import type { RobotKinematicsModel, WorkObjectTarget } from '../kinematics'

const props = defineProps<{
  controller: RobotController | null
  model: RobotKinematicsModel
  frames: CoordinateFrame[]
  target: WorkObjectTarget
}>()

const tick = ref(0)
let timer: number | undefined
onMounted(() => { timer = window.setInterval(() => { tick.value++ }, 200) })
onBeforeUnmount(() => { if (timer !== undefined) window.clearInterval(timer) })

const toolPose = computed(() => {
  const refresh = tick.value
  if (!props.controller || refresh < 0) return 'waiting for controller'
  const position = props.model.forward(props.controller.jointAngles).position
  return `${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)} m`
})
const targetPose = computed(() => `${props.target.pose.position.x.toFixed(3)}, ${props.target.pose.position.y.toFixed(3)}, ${props.target.pose.position.z.toFixed(3)} m`)
const solverStatus = computed(() => props.controller ? 'ready' : 'waiting')
function degrees(value: number): string { return ((value * 180) / Math.PI).toFixed(1) }
</script>

<style scoped>
.kinematics-overlay { position: absolute; left: 1rem; bottom: 1rem; z-index: 24; width: min(23rem, calc(100vw - 2rem)); color: #e5edf2; background: rgb(10 22 31 / 92%); border: 1px solid #2c718b; border-radius: .35rem; padding: .7rem .8rem; font: .73rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 28%); }
header { display: flex; gap: .5rem; align-items: center; color: #b9eaff; }
.axis-marker { color: #f7c948; font-weight: 800; letter-spacing: .08em; }
.model { margin: .35rem 0 .55rem; color: #a9c3ce; }
dl { margin: 0; } dl div { display: flex; justify-content: space-between; gap: .75rem; border-top: 1px solid rgb(120 170 188 / 18%); padding: .25rem 0; } dt { color: #82c9df; } dd { margin: 0; text-align: right; }
details { margin-top: .45rem; color: #bfd3dc; } summary { cursor: pointer; color: #f7c948; } ul, ol { margin: .35rem 0 0; padding-left: 1.1rem; }
@media (max-width: 760px) { .kinematics-overlay { bottom: .5rem; left: .5rem; font-size: .67rem; } }
</style>
