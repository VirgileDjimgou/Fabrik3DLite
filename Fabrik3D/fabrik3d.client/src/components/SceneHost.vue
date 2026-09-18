<template>
  <SingleConveyorCellLayout v-if="preset.runtimeProfile === 'single-conveyor-machining'" />
  <MaterialFlowScenarioHost v-else-if="preset.runtimeProfile === 'material-flow'" :preset="preset" />
  <SceneLayoutPreview v-else :preset="preset" />
</template>

<script setup lang="ts">
import type { ScenePreset } from '../scenes'
import SingleConveyorCellLayout from './SingleConveyorCellLayout.vue'
import SceneLayoutPreview from './SceneLayoutPreview.vue'
import MaterialFlowScenarioHost from './MaterialFlowScenarioHost.vue'

defineProps<{ preset: ScenePreset }>()
</script>
