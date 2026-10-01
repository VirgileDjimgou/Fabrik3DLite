/**
 * Role-aware navigation catalogue (S53).
 *
 * One data-driven source for the HMI information architecture. Each entry declares its persona
 * group and the permission it needs; the HMI only shapes the surface. The server still authorizes
 * every request, so hiding an entry is never a control.
 *
 * Engineering authoring surfaces live in the separate simulation workspace deployment; they are
 * exposed here as workspace links when `VITE_SIMULATOR_URL` is configured, never duplicated in the
 * operator HMI.
 */

export type NavGroupId = 'operator' | 'engineering' | 'training' | 'administration'
export type NavPermission = 'read' | 'operate' | 'engineer' | 'instruct' | 'admin'

export interface NavGroup {
  id: NavGroupId
  labelKey: string
}

export interface NavItem {
  id: string
  group: NavGroupId
  labelKey: string
  icon: string
  /** HMI route, or a workspace-relative view when `external` is true. */
  to: string
  permission: NavPermission
  /** True when the item opens the separate simulation workspace. */
  external?: boolean
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'operator', labelKey: 'navigation.groupOperator' },
  { id: 'engineering', labelKey: 'navigation.groupEngineering' },
  { id: 'training', labelKey: 'navigation.groupTraining' },
  { id: 'administration', labelKey: 'navigation.groupAdministration' },
]

export const NAV_ITEMS: readonly NavItem[] = [
  // Operator
  { id: 'home', group: 'operator', labelKey: 'nav.home', icon: 'bi-house-fill', to: '/', permission: 'read' },
  { id: 'currentJob', group: 'operator', labelKey: 'navigation.currentJob', icon: 'bi-clipboard-data', to: '/current-job', permission: 'read' },
  { id: 'jobs', group: 'operator', labelKey: 'navigation.jobs', icon: 'bi-list-ul', to: '/jobs', permission: 'read' },
  { id: 'robotPositions', group: 'operator', labelKey: 'navigation.robot', icon: 'bi-robot', to: '/robot-positions', permission: 'operate' },
  { id: 'alarms', group: 'operator', labelKey: 'navigation.alarms', icon: 'bi-exclamation-triangle', to: '/alarms', permission: 'read' },
  { id: 'messages', group: 'operator', labelKey: 'navigation.messages', icon: 'bi-chat-dots', to: '/messages', permission: 'read' },

  // Engineering (simulation workspace)
  { id: 'cellEditor', group: 'engineering', labelKey: 'navigation.cellEditor', icon: 'bi-grid-3x3-gap', to: '?view=cell-editor', permission: 'engineer', external: true },
  { id: 'signalMapping', group: 'engineering', labelKey: 'navigation.signalMapping', icon: 'bi-diagram-3', to: '?view=mapping-studio', permission: 'engineer', external: true },
  { id: 'connectors', group: 'engineering', labelKey: 'navigation.connectors', icon: 'bi-plug', to: '?view=connectors', permission: 'engineer', external: true },
  { id: 'diagnostics', group: 'engineering', labelKey: 'navigation.diagnostics', icon: 'bi-activity', to: '?view=diagnostics', permission: 'engineer', external: true },
  { id: 'timeTravel', group: 'engineering', labelKey: 'navigation.timeTravel', icon: 'bi-clock-history', to: '?view=time-travel', permission: 'engineer', external: true },
  { id: 'assetCatalog', group: 'engineering', labelKey: 'navigation.assetCatalog', icon: 'bi-boxes', to: '?view=asset-catalog', permission: 'engineer', external: true },

  // Training
  { id: 'scenarios', group: 'training', labelKey: 'navigation.scenarios', icon: 'bi-collection-play', to: '?view=scenarios', permission: 'operate', external: true },
  { id: 'stepMode', group: 'training', labelKey: 'navigation.stepMode', icon: 'bi-skip-forward-circle', to: '?view=step-mode', permission: 'operate', external: true },
  { id: 'faultLab', group: 'training', labelKey: 'navigation.faultLab', icon: 'bi-bug', to: '?view=fault-lab', permission: 'operate', external: true },
  { id: 'assessment', group: 'training', labelKey: 'navigation.assessment', icon: 'bi-clipboard-check', to: '?view=assessment', permission: 'operate', external: true },
  { id: 'instructor', group: 'training', labelKey: 'instructor.open', icon: 'bi-mortarboard', to: '/instructor', permission: 'instruct' },

  // Administration
  { id: 'settings', group: 'administration', labelKey: 'navigation.identity', icon: 'bi-person-badge', to: '/settings', permission: 'read' },
]

export type PermissionCheck = (permission: NavPermission) => boolean

/**
 * Resolves an item's href. HMI routes are returned as-is; workspace items are only addressable when
 * a simulation workspace base is configured, otherwise they are omitted from the surface.
 */
export function resolveHref(item: NavItem, simulatorUrl?: string): string | null {
  if (!item.external) return item.to
  const base = simulatorUrl?.trim()
  if (!base) return null
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/${item.to}`
}

export interface VisibleNavGroup extends NavGroup {
  items: { item: NavItem; href: string }[]
}

/** Groups and items visible to the current permission set, with empty groups removed. */
export function visibleNavGroups(can: PermissionCheck, simulatorUrl?: string): VisibleNavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: NAV_ITEMS
        .filter((item) => item.group === group.id && can(item.permission))
        .map((item) => ({ item, href: resolveHref(item, simulatorUrl) }))
        .filter((entry): entry is { item: NavItem; href: string } => entry.href !== null),
    }))
    .filter((group) => group.items.length > 0)
}

/** Route guard helper: may the current permission set reach this HMI path? */
export function canAccessRoute(path: string, can: PermissionCheck): boolean {
  const item = NAV_ITEMS.find((candidate) => !candidate.external && candidate.to === path)
  if (!item) return true
  return can(item.permission)
}
