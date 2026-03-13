<template>
  <div class="hmi-gauge">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size">
      <circle :cx="center" :cy="center" :r="radius"
        fill="none" :stroke="trackColor" :stroke-width="strokeWidth"
        :stroke-dasharray="circumference" stroke-dashoffset="0"
        stroke-linecap="round" :transform="`rotate(-90 ${center} ${center})`" />
      <circle :cx="center" :cy="center" :r="radius"
        fill="none" stroke="var(--hmi-icon-color)" :stroke-width="strokeWidth"
        :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset"
        stroke-linecap="round" :transform="`rotate(-90 ${center} ${center})`" />
      <text :x="center" :y="center - 6" text-anchor="middle"
        font-size="12" fill="var(--hmi-text-muted)">{{ label }}</text>
      <text :x="center" :y="center + 14" text-anchor="middle"
        font-size="22" font-weight="700" fill="var(--hmi-text)">{{ displayValue }}%</text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number; label?: string; size?: number
  strokeWidth?: number; trackColor?: string
}>(), { label: '', size: 140, strokeWidth: 10, trackColor: '#dee2e6' })

const center = computed(() => props.size / 2)
const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const clampedValue = computed(() => Math.max(0, Math.min(100, props.value)))
const dashOffset = computed(() => circumference.value * (1 - clampedValue.value / 100))
const displayValue = computed(() => Math.round(clampedValue.value))
</script>
