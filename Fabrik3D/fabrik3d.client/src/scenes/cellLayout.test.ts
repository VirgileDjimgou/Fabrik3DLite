import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CELL_LAYOUT_REQUIREMENTS,
  computeCellExtents,
  deriveCameraPreset,
  deriveFloorSizeMeters,
  footprintBounds,
  framingDistanceMeters,
  resolveCellLayout,
  validateCellLayout,
  type CellFootprint,
} from './cellLayout'
import { cellFootprints, dimensionsForDefinition, roleForDefinition } from './cellFootprints'
import { BUILT_IN_SCENE_PRESETS } from './catalog'

function footprint(overrides: Partial<CellFootprint> & Pick<CellFootprint, 'id' | 'role'>): CellFootprint {
  return {
    definitionId: overrides.id,
    center: { x: 0, z: 0 },
    size: { x: 1, z: 1 },
    heightMeters: 1,
    ...overrides,
  }
}

const robot = (overrides: Partial<CellFootprint> = {}) =>
  footprint({ id: 'robot-1', role: 'robot', size: { x: 0.8, z: 0.8 }, heightMeters: 1.6, reachMeters: 1.0, ...overrides })

const machine = (id: string, x: number, z: number, overrides: Partial<CellFootprint> = {}) =>
  footprint({ id, role: 'machine', center: { x, z }, size: { x: 1, z: 1 }, heightMeters: 2, robotService: true, ...overrides })

describe('cell layout geometry', () => {
  it('expands rotated footprints into a conservative AABB', () => {
    const rotated = footprintBounds(footprint({ id: 'a', role: 'machine', size: { x: 2, z: 0.5 }, rotationY: Math.PI / 2 }))
    expect(rotated.maxX - rotated.minX).toBeCloseTo(0.5, 6)
    expect(rotated.maxZ - rotated.minZ).toBeCloseTo(2, 6)
  })

  it('measures extents including the robot reach envelope', () => {
    const extents = computeCellExtents([
      robot({ center: { x: 0, z: 0 }, reachMeters: 2 }),
      machine('cnc', 0, 4),
    ])
    expect(extents.minZ).toBeCloseTo(-2, 6)
    expect(extents.maxZ).toBeCloseTo(4.5, 6)
    expect(extents.width).toBeCloseTo(4, 6)
  })

  it('derives a floor that contains the extents and rounds up to 0.5 m', () => {
    const extents = computeCellExtents([machine('cnc', 3.1, 0), machine('cnc-2', 0, 2.2)])
    const floor = deriveFloorSizeMeters(extents, 1.5)
    expect(floor.x % 0.5).toBe(0)
    expect(floor.z % 0.5).toBe(0)
    expect(floor.x / 2).toBeGreaterThanOrEqual(Math.max(Math.abs(extents.minX), Math.abs(extents.maxX)))
    expect(floor.z / 2).toBeGreaterThanOrEqual(Math.max(Math.abs(extents.minZ), Math.abs(extents.maxZ)))
  })

  it('derives a camera that frames the measured extents', () => {
    const extents = computeCellExtents([machine('cnc', 0, 4)])
    const camera = deriveCameraPreset(extents, { cameraMarginMeters: DEFAULT_CELL_LAYOUT_REQUIREMENTS.cameraMarginMeters })
    const distance = Math.hypot(camera.position.x - camera.target.x, camera.position.y - camera.target.y, camera.position.z - camera.target.z)
    expect(distance).toBeGreaterThanOrEqual(framingDistanceMeters(extents, DEFAULT_CELL_LAYOUT_REQUIREMENTS.cameraMarginMeters) - 1e-6)
    expect(camera.target.x).toBeCloseTo(extents.centerX, 6)
    expect(camera.target.z).toBeCloseTo(extents.centerZ, 6)
  })
})

describe('cell layout validation', () => {
  it('flags equipment outside the declared floor', () => {
    const diagnostics = validateCellLayout({
      footprints: [machine('cnc', 3, 0)],
      floorSizeMeters: { x: 4, z: 4 },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'equipment-outside-floor' }))
  })

  it('flags gross overlap between two machines but allows a pallet on a conveyor', () => {
    const overlap = validateCellLayout({ footprints: [machine('a', 0, 0), machine('b', 0.4, 0)] })
    expect(overlap).toContainEqual(expect.objectContaining({ code: 'equipment-overlap' }))

    const allowed = validateCellLayout({
      footprints: [
        footprint({ id: 'conveyor', role: 'conveyor', definitionId: 'belt-conveyor', center: { x: 0, z: 0 }, size: { x: 2, z: 0.5 } }),
        footprint({ id: 'pallet', role: 'pallet', definitionId: 'euro-pallet', center: { x: 0, z: 0 }, size: { x: 1.2, z: 0.8 } }),
      ],
    })
    expect(allowed.some((diagnostic) => diagnostic.code === 'equipment-overlap')).toBe(false)
  })

  it('warns when a service target is outside the robot reach envelope', () => {
    const diagnostics = validateCellLayout({ footprints: [robot(), machine('far-cnc', 3, 0)] })
    expect(diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'robot-unreachable' }))
  })

  it('accepts a service target inside the robot reach envelope', () => {
    const diagnostics = validateCellLayout({ footprints: [robot(), machine('near-cnc', 1.2, 0)] })
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'robot-unreachable')).toBe(false)
  })

  it('warns when a fence sits inside the robot swept envelope', () => {
    const diagnostics = validateCellLayout({
      footprints: [robot(), footprint({ id: 'fence-1', role: 'infrastructure', definitionId: 'fence-panel', center: { x: 0, z: 0.6 }, size: { x: 2.4, z: 0.06 } })],
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'fence-clearance' }))
  })

  it('warns when service clearance, operator corridor or conveyor access is tight', () => {
    const tight = validateCellLayout({
      footprints: [footprint({ id: 'big-cnc', role: 'machine', size: { x: 3.6, z: 3.6 }, heightMeters: 2 })],
      floorSizeMeters: { x: 4, z: 4 },
    })
    expect(tight).toContainEqual(expect.objectContaining({ code: 'service-clearance' }))
    expect(tight).toContainEqual(expect.objectContaining({ code: 'operator-corridor' }))

    const conveyor = validateCellLayout({
      footprints: [footprint({ id: 'belt', role: 'conveyor', definitionId: 'belt-conveyor', center: { x: 1.5, z: 0 }, size: { x: 2, z: 0.5 } })],
      floorSizeMeters: { x: 4, z: 4 },
    })
    expect(conveyor).toContainEqual(expect.objectContaining({ code: 'conveyor-footprint' }))
  })

  it('warns when a protective zone cannot contain the robot envelope', () => {
    const diagnostics = validateCellLayout({
      footprints: [
        robot({ reachMeters: 1.5 }),
        footprint({ id: 'zone-1', role: 'safety-zone', center: { x: 0, z: 0 }, size: { x: 2, z: 2 }, heightMeters: 0.02, floorMarking: true }),
      ],
      floorSizeMeters: { x: 8, z: 8 },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'safety-zone-too-small' }))
  })

  it('warns when the camera cannot frame the measured cell', () => {
    const diagnostics = validateCellLayout({
      footprints: [machine('cnc', 0, 0), machine('cnc-2', 10, 0)],
      camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'camera-framing' }))
  })
})

describe('S60 built-in scene layout', () => {
  it('maps equipment classes to declared roles and dimensions', () => {
    expect(roleForDefinition('fanuc-like-6axis')).toBe('robot')
    expect(roleForDefinition('belt-conveyor')).toBe('conveyor')
    expect(roleForDefinition('safety-zone')).toBe('safety-zone')
    expect(dimensionsForDefinition('educational-cnc')).toEqual({ x: 2, y: 2.2, z: 1.6 })
  })

  it('derives a floor and camera from measured bounds with no layout errors', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      expect(footprints.length).toBe(preset.cell.equipment.length)
      const layout = resolveCellLayout({ footprints })
      const errors = layout.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      expect(errors, `${preset.id}: ${errors.map((diagnostic) => diagnostic.message).join(' ')}`).toEqual([])

      // Derived floor contains every equipment centre and the derived camera frames the cell.
      for (const equipment of preset.cell.equipment) {
        expect(Math.abs(equipment.transform.position.x)).toBeLessThanOrEqual(layout.floorSizeMeters.x / 2 + 1e-6)
        expect(Math.abs(equipment.transform.position.z)).toBeLessThanOrEqual(layout.floorSizeMeters.z / 2 + 1e-6)
      }
      const distance = Math.hypot(
        layout.camera.position.x - layout.camera.target.x,
        layout.camera.position.y - layout.camera.target.y,
        layout.camera.position.z - layout.camera.target.z,
      )
      expect(distance).toBeGreaterThanOrEqual(framingDistanceMeters(layout.extents, DEFAULT_CELL_LAYOUT_REQUIREMENTS.cameraMarginMeters) - 1e-3)
      expect(preset.environment.floorSizeMeters).toEqual(layout.floorSizeMeters)
      expect(preset.camera).toEqual(layout.camera)
    }
  })
})
