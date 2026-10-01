import { describe, expect, it } from 'vitest'
import { canAccessRoute, NAV_ITEMS, resolveHref, visibleNavGroups, type NavPermission } from './navCatalog'

function permissions(granted: NavPermission[]) {
  return (permission: NavPermission) => granted.includes(permission)
}

const ALL: NavPermission[] = ['read', 'operate', 'engineer', 'instruct', 'admin']

function groupIds(granted: NavPermission[], url?: string) {
  return visibleNavGroups(permissions(granted), url).map((group) => group.id)
}

function itemIds(granted: NavPermission[], url?: string) {
  return visibleNavGroups(permissions(granted), url).flatMap((group) => group.items.map((entry) => entry.item.id))
}

describe('navCatalog', () => {
  it('gives an operator the operator surface plus administration, without engineering', () => {
    expect(groupIds(['read', 'operate'])).toEqual(['operator', 'administration'])
    const ids = itemIds(['read', 'operate'])
    expect(ids).toContain('robotPositions')
    expect(ids).not.toContain('cellEditor')
    expect(ids).not.toContain('instructor')
  })

  it('gives an engineer the engineering workspace entries when the workspace is configured', () => {
    const ids = itemIds(['read', 'operate', 'engineer'], 'http://localhost:8081')
    expect(ids).toContain('cellEditor')
    expect(ids).toContain('signalMapping')
    expect(groupIds(['read', 'operate', 'engineer'])).not.toContain('engineering')
  })

  it('gives an instructor the instructor surface without duplicating operator commands', () => {
    const ids = itemIds(['read', 'instruct'])
    expect(ids).toContain('instructor')
    expect(ids).not.toContain('robotPositions')
  })

  it('keeps read-only personas off operate and engineer surfaces', () => {
    const ids = itemIds(['read'])
    expect(ids).toContain('home')
    expect(ids).not.toContain('robotPositions')
    expect(ids).not.toContain('cellEditor')
  })

  it('resolves external workspace links and hides them when no workspace is configured', () => {
    const cellEditor = NAV_ITEMS.find((item) => item.id === 'cellEditor')!
    expect(resolveHref(cellEditor)).toBeNull()
    expect(resolveHref(cellEditor, 'http://localhost:8081/')).toBe('http://localhost:8081/?view=cell-editor')
    expect(resolveHref(NAV_ITEMS.find((item) => item.id === 'home')!, '')).toBe('/')
  })

  it('guards direct navigation to privileged routes', () => {
    expect(canAccessRoute('/robot-positions', permissions(['read']))).toBe(false)
    expect(canAccessRoute('/robot-positions', permissions(['read', 'operate']))).toBe(true)
    expect(canAccessRoute('/instructor', permissions(['read', 'operate']))).toBe(false)
    expect(canAccessRoute('/instructor', permissions(['read', 'instruct']))).toBe(true)
    expect(canAccessRoute('/', permissions(['read']))).toBe(true)
    expect(canAccessRoute('/unknown', permissions([]))).toBe(true)
  })

  it('declares a group and permission for every entry', () => {
    for (const item of NAV_ITEMS) {
      expect(ALL).toContain(item.permission)
      expect(['operator', 'engineering', 'training', 'administration']).toContain(item.group)
      expect(item.labelKey.length).toBeGreaterThan(0)
    }
  })
})
