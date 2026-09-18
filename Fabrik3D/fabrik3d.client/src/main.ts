import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import RobotCatalogPanelPage from './components/RobotCatalogPanelPage.vue'
import CellEditorPage from './components/CellEditorPage.vue'
import ScenarioLab from './components/ScenarioLab.vue'
import SceneSelectorPanelPage from './components/SceneSelectorPanelPage.vue'

// Lightweight, WebGL-free entries used by visual regression and e2e tests
// to exercise the robot selection, cell editor, and scenario UIs deterministically.
const params = new URLSearchParams(window.location.search)
const view = params.get('view')
const root = view === 'robot-catalog' ? RobotCatalogPanelPage
  : view === 'cell-editor' ? CellEditorPage
  : view === 'scenario' ? ScenarioLab
  : view === 'scene-presets' ? SceneSelectorPanelPage
  : App

createApp(root).mount('#app')
