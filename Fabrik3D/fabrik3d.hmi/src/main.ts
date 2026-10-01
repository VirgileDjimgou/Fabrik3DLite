import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { navigationGuard, routes } from './router'
import { i18n } from './i18n'

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(navigationGuard)
const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')
