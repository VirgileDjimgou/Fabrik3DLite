<template>
  <main class="page">
    <SceneSelectorPanel
      :presets="presets"
      :selected-id="selectedId"
      locale="fr"
      @select="select"
      @reset="reset"
    />
    <SceneLayoutPreview :preset="selected" />
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneSelectorPanel from './SceneSelectorPanel.vue'
import SceneLayoutPreview from './SceneLayoutPreview.vue'
import { createDefaultScenePresetCatalog, DEFAULT_SCENE_PRESET_ID } from '../scenes'

const catalog = createDefaultScenePresetCatalog()
const presets = catalog.list()
const selectedId = ref(DEFAULT_SCENE_PRESET_ID)
const selected = computed(() => catalog.get(selectedId.value))
function select(id: string): void { selectedId.value = id }
function reset(): void { selectedId.value = DEFAULT_SCENE_PRESET_ID }
</script>

<style scoped>
.page { width: 100vw; height: 100vh; overflow: hidden; background: #0c1419; }
</style>
