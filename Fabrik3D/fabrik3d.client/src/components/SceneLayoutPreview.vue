<template>
  <section class="layout-preview" data-layout-preview>
    <div class="message">
      <strong>{{ preset.name.fr }}</strong>
      <span>{{ preset.capability === 'simulation-ready' ? 'Vue d’implantation — runtime simulé' : 'Vue d’implantation — simulation non disponible' }}</span>
    </div>
    <svg viewBox="-5 -5 10 10" role="img" :aria-label="preset.name.fr">
      <g class="grid">
        <line v-for="line in grid" :key="`x-${line}`" :x1="line" y1="-5" :x2="line" y2="5" />
        <line v-for="line in grid" :key="`z-${line}`" x1="-5" :y1="line" x2="5" :y2="line" />
      </g>
      <g v-for="equipment in preset.cell.equipment" :key="equipment.id" :data-equipment="equipment.id">
        <rect
          :x="equipment.transform.position.x - size(equipment.definitionId) / 2"
          :y="-equipment.transform.position.z - size(equipment.definitionId) / 2"
          :width="size(equipment.definitionId)"
          :height="size(equipment.definitionId)"
          :class="equipment.definitionId"
        />
        <text :x="equipment.transform.position.x" :y="-equipment.transform.position.z">{{ equipment.id }}</text>
      </g>
    </svg>
  </section>
</template>

<script setup lang="ts">
import type { ScenePreset } from '../scenes'

defineProps<{ preset: ScenePreset }>()
const grid = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
function size(definitionId: string): number { return definitionId === 'safety-zone' ? 4 : 1.2 }
</script>

<style scoped>
.layout-preview { width: 100%; height: 100vh; background: #0c1419; color: #e5edf2; position: relative; }
.message { position: absolute; top: 8rem; left: 50%; z-index: 2; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: .2rem; padding: .7rem 1rem; border: 1px solid #d3a62c; border-radius: .4rem; background: rgb(10 22 31 / 94%); font: .78rem/1.4 ui-monospace, monospace; }
.message span { color: #ffd166; }
svg { width: 100%; height: 100%; }
.grid line { stroke: rgb(120 170 188 / 15%); stroke-width: .015; }
rect { fill: rgb(82 164 199 / 28%); stroke: #52a4c7; stroke-width: .04; }
rect.safety-zone { fill: rgb(0 200 120 / 10%); stroke: #00c878; stroke-dasharray: .15 .1; }
text { fill: #dce9ee; font: .18px ui-monospace, monospace; text-anchor: middle; dominant-baseline: middle; }
</style>
