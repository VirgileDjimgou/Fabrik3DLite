import type { RouteRecordRaw } from 'vue-router'
import HmiShell from '@/components/layout/HmiShell.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: HmiShell,
    children: [
      { path: '',                name: 'home',           component: () => import('@/views/HomeView.vue') },
      { path: 'current-job',     name: 'currentJob',     component: () => import('@/views/CurrentJobView.vue') },
      { path: 'jobs',            name: 'jobList',         component: () => import('@/views/JobListView.vue') },
      { path: 'new-job',         name: 'newJob',          component: () => import('@/views/NewJobView.vue') },
      { path: 'messages',        name: 'messages',        component: () => import('@/views/MessagesView.vue') },
      { path: 'alarms',          name: 'alarms',          component: () => import('@/views/AlarmsView.vue') },
      { path: 'settings',        name: 'settings',        component: () => import('@/views/SettingsView.vue') },
      { path: 'robot-positions', name: 'robotPositions',  component: () => import('@/views/RobotPositionsView.vue') },
    ],
  },
]
