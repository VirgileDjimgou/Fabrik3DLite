<template>
  <svg
    class="tt-scene"
    data-tt-scene
    :data-tt-joints="jointsKey"
    :data-tt-slot="slotIndex ?? 'none'"
    viewBox="0 0 400 240"
    role="img"
    :aria-label="ariaLabel"
  >
    <!-- Floor and CNC bench: the same cell topology as the live scene, drawn from reconstructed state. -->
    <rect x="0" y="0" width="400" height="240" fill="#0b1a22" />
    <g stroke="#1d3d4c" stroke-width="1">
      <line v-for="x in grid" :key="`vx-${x}`" :x1="x" y1="30" :x2="x" y2="220" />
      <line v-for="y in grid" :key="`hy-${y}`" x1="20" :y1="y" x2="380" :y2="y" />
    </g>
    <rect x="250" y="60" width="110" height="120" rx="6" fill="#12262f" stroke="#2c718b" />
    <text x="305" y="52" text-anchor="middle" fill="#9de3f6" font-size="10" font-family="monospace">CNC</text>

    <!-- Pallet: raw and machined slots at reconstructed positions. -->
    <g data-tt-pallet>
      <rect x="200" y="196" width="150" height="14" rx="3" fill="#274450" stroke="#3d6b7a" />
      <circle cx="228" cy="190" :r="slotIndex === 0 ? 8 : 5" :fill="slotIndex === 0 ? '#68dfa8' : '#3d6b7a'" data-tt-slot-marker="0" />
      <circle cx="300" cy="190" :r="slotIndex === 1 ? 8 : 5" :fill="slotIndex === 1 ? '#68dfa8' : '#3d6b7a'" data-tt-slot-marker="1" />
    </g>

    <!-- Robot arm, driven only by reconstructed joint values. -->
    <g data-tt-arm>
      <rect :x="baseX - 16" :y="baseY" width="32" height="18" rx="3" fill="#24404d" stroke="#4c8296" />
      <line :x1="baseX" :y1="baseY" :x2="elbowX" :y2="elbowY" stroke="#ffd166" stroke-width="7" stroke-linecap="round" />
      <line :x1="elbowX" :y1="elbowY" :x2="tipX" :y2="tipY" stroke="#9de3f6" stroke-width="5" stroke-linecap="round" />
      <circle :cx="baseX" :cy="baseY" r="5" fill="#0b1a22" stroke="#ffd166" stroke-width="2" />
      <circle :cx="elbowX" :cy="elbowY" r="4" fill="#0b1a22" stroke="#9de3f6" stroke-width="2" />
      <circle :cx="tipX" :cy="tipY" r="6" :fill="carrying ? '#ffd166' : '#2c718b'" data-tt-tool />
    </g>

    <text x="20" y="28" fill="#9de3f6" font-size="10" font-family="monospace">REPLAY SCENE — READ ONLY</text>
    <text x="380" y="228" text-anchor="end" fill="#8fb6c4" font-size="9" font-family="monospace" data-tt-scene-exactness>{{ exactness }}</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReconstructionExactness } from '../timeTravel/types'

const props = defineProps<{
  joints: readonly number[] | null
  slotIndex: number | null
  exactness: ReconstructionExactness
  carrying: boolean
}>()

const grid = [60, 100, 140, 180, 220, 260, 300, 340]
const baseX = 90
const baseY = 190
const link1 = 74
const link2 = 64

const jointsKey = computed(() => (props.joints ? props.joints.map((value) => value.toFixed(3)).join(',') : 'none'))

const shoulder = computed(() => -Math.PI / 2 + (props.joints?.[1] ?? 0))
const elbowAngle = computed(() => shoulder.value + (props.joints?.[2] ?? 0))
const elbowX = computed(() => baseX + link1 * Math.cos(shoulder.value))
const elbowY = computed(() => baseY + link1 * Math.sin(shoulder.value))
const tipX = computed(() => elbowX.value + link2 * Math.cos(elbowAngle.value))
const tipY = computed(() => elbowY.value + link2 * Math.sin(elbowAngle.value))

const ariaLabel = computed(() => `Replay cell scene, joints ${jointsKey.value}, exactness ${props.exactness}`)
</script>

<style scoped>
.tt-scene { width: 100%; height: auto; display: block; border: 1px solid #1d3d4c; border-radius: 0.3rem; background: #0b1a22; }
</style>
