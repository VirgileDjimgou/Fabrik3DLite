import type { RouteRecordRaw } from 'vue-router'
import HmiShell from '@/components/layout/HmiShell.vue'
import { canAdmin, canEngineer, canInstruct, canOperate, canRead, isAuthenticated, restoreSession } from '@/auth/authStore'
import { canAccessRoute, type NavPermission } from '@/navigation/navCatalog'

export function permissionCheck(permission: NavPermission): boolean {
  switch (permission) {
    case 'operate': return canOperate()
    case 'engineer': return canEngineer()
    case 'instruct': return canInstruct()
    case 'admin': return canAdmin()
    default: return canRead()
  }
}

/**
 * Route guard (S53): hidden UI is not authorization, but a persona must not land on a surface it
 * cannot use. Every request is still authorized server-side.
 */
export function navigationGuard(to: { path: string }): true | { name: string } {
  if (!isAuthenticated()) restoreSession()
  // HmiShell owns the unauthenticated login surface. Redirecting an anonymous user to `home`
  // would guard `home` again and trap Vue Router in an infinite redirect before HmiLogin mounts.
  if (!isAuthenticated()) return true
  if (!canAccessRoute(to.path, permissionCheck)) return { name: 'home' }
  return true
}

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
      {
        // Separate instructor surface (S45). The route guard is a UX separation only; the server
        // enforces the Instructor role on every dashboard request.
        path: 'instructor',
        name: 'instructor',
        component: () => import('@/views/InstructorDashboardView.vue'),
        beforeEnter: () => {
          if (!isAuthenticated()) restoreSession()
          return canInstruct() ? true : { name: 'home' }
        },
      },
    ],
  },
]
