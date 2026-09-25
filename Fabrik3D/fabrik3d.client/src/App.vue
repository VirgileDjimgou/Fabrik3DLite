<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneHost from './components/SceneHost.vue'
import SceneSelectorPanel from './components/SceneSelectorPanel.vue'
import CellEditor from './components/CellEditor.vue'
import SimulatorAuthBar from './components/SimulatorAuthBar.vue'
import { createDefaultRobotCatalog } from './robot/catalog'
import { resetFloatingOverlays } from './composables/useDraggableOverlay'
import { createDefaultScenePresetCatalog, DEFAULT_SCENE_PRESET_ID, SceneSelectionController } from './scenes'
import { useSimulatorI18n, type SimulatorLocale } from './i18n/simulator'

type ShellMode = 'execution' | 'editing'

const catalog = createDefaultRobotCatalog()
const mode = ref<ShellMode>('execution')
const sceneCatalog = createDefaultScenePresetCatalog()
const sceneSelection = new SceneSelectionController(sceneCatalog, DEFAULT_SCENE_PRESET_ID)
const scenePresets = sceneCatalog.list()
const selectedSceneId = ref(sceneSelection.selectedId)
const sceneHostKey = ref(sceneSelection.hostKey)
const selectedScene = computed(() => sceneCatalog.get(selectedSceneId.value))
const { locale, t, setLocale } = useSimulatorI18n()

function setMode(next: ShellMode): void {
  // Explicit mode transition: switching away from execution unmounts the
  // running scene, so editing can never mutate an active scenario.
  mode.value = next
}

function resetPanels(): void {
  resetFloatingOverlays()
}

function selectScene(id: string): void {
  sceneSelection.select(id)
  selectedSceneId.value = sceneSelection.selectedId
  sceneHostKey.value = sceneSelection.hostKey
}

function resetScene(): void {
  sceneSelection.reset()
  selectedSceneId.value = sceneSelection.selectedId
  sceneHostKey.value = sceneSelection.hostKey
}

function changeLocale(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as SimulatorLocale)
}
</script>

<template>
  <div class="app-shell">
    <div class="mode-bar" data-mode-bar>
      <button
        type="button"
        class="mode-button"
        :class="{ active: mode === 'execution' }"
        data-mode="execution"
        @click="setMode('execution')"
      >{{ t('app.run') }}</button>
      <button
        type="button"
        class="mode-button"
        :class="{ active: mode === 'editing' }"
        data-mode="editing"
        @click="setMode('editing')"
      >{{ t('app.edit') }}</button>
      <a
        v-if="mode === 'editing'"
        class="reset-panels"
        data-action="mapping-studio"
        href="?view=mapping-studio"
      >{{ t('app.mappingStudio') }}</a>
      <button type="button" class="reset-panels" data-action="reset-panels" @click="resetPanels">{{ t('app.resetPanels') }}</button>
      <label class="language-select">
        <span>{{ t('app.language') }}</span>
        <select :value="locale" @change="changeLocale">
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </label>
      <SimulatorAuthBar />
    </div>
    <SceneSelectorPanel :presets="scenePresets" :selected-id="selectedSceneId" :locale="locale" @select="selectScene" @reset="resetScene" />
    <SceneHost v-if="mode === 'execution'" :key="sceneHostKey" :preset="selectedScene" />
    <CellEditor v-else :robot-catalog="catalog" />
  </div>
</template>

<style scoped>
.app-shell { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.mode-bar {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  gap: 0.3rem;
  background: rgb(10 22 31 / 92%);
  border: 1px solid #2c718b;
  border-radius: 0.4rem;
  padding: 0.25rem;
  font: 0.72rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.mode-button {
  padding: 0.3rem 0.9rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: #9fc4d2;
  cursor: pointer;
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mode-button.active { background: #00cc88; color: #06201a; font-weight: 700; }
.reset-panels { padding: .3rem .6rem; border: 1px solid #34758a; border-radius: .3rem; background: transparent; color: #b9eaff; cursor: pointer; font: inherit; }
.reset-panels:hover { border-color: #00cc88; color: #fff; }
.language-select { display: flex; align-items: center; gap: .3rem; padding: 0 .25rem; color: #9fc4d2; font: inherit; }
.language-select select { border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #fff; padding: .23rem .3rem; font: inherit; }
</style>
