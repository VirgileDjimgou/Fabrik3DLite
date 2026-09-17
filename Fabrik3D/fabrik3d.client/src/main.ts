import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import RobotCatalogPanelPage from './components/RobotCatalogPanelPage.vue'

// A lightweight, WebGL-free entry used by visual regression tests to
// exercise the robot selection UI deterministically.
const params = new URLSearchParams(window.location.search)
const root = params.get('view') === 'robot-catalog' ? RobotCatalogPanelPage : App

createApp(root).mount('#app')
