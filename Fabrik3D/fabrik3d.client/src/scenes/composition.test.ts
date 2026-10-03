import { describe, expect, it } from 'vitest'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { createSafetyRobotModel } from '../safety/robotModel'
import { BUILT_IN_SCENE_PRESETS } from './catalog'
import {
  DEFAULT_CELL_LAYOUT_REQUIREMENTS,
  cameraContainsExtents,
  deriveCameraPreset,
  deriveCameraPresets,
  distanceToBounds,
  footprintBounds,
  framingDistanceMeters,
  resolveCellLayout,
  validateCellLayout,
  type CellFootprint,
} from './cellLayout'
import { cellFootprints, robotProfileIdForCell, robotReachMetersForProfile } from './cellFootprints'

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
  footprint({ id: 'robot-1', role: 'robot', size: { x: 0.8, z: 0.8 }, heightMeters: 1.6, reachMeters: 1, ...overrides })

const MARGIN = DEFAULT_CELL_LAYOUT_REQUIREMENTS.cameraMarginMeters

/**
 * S69 composition acceptance: the five flagship cells must pass the measured
 * layout checks (overlap, floor bounds, robot reach, clearances, camera
 * containment) and expose deterministic derived camera views.
 */
describe('S69 flagship cell composition', () => {
  it('passes overlap, bounds, reach and clearance checks for all five cells', () => {
    expect(BUILT_IN_SCENE_PRESETS).toHaveLength(5)
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const layout = resolveCellLayout({ footprints: cellFootprints(preset.cell) })
      const diagnostics = layout.diagnostics
      expect(
        diagnostics,
        `${preset.id}: ${diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.message}`).join(' | ')}`,
      ).toEqual([])
    }
  })

  it('derives each robot reach from the same safety envelope the runtime reachability uses', () => {
    const catalog = createDefaultRobotCatalog()
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const robotFootprint = cellFootprints(preset.cell).find((candidate) => candidate.role === 'robot')
      if (!robotFootprint) continue
      const profileId = robotProfileIdForCell(preset.cell.id)
      const envelope = createSafetyRobotModel(catalog.getRobot(profileId)).maxReachMeters()
      expect(robotFootprint.reachMeters, preset.id).toBeCloseTo(envelope, 9)
      expect(robotFootprint.reachMeters, preset.id).toBe(robotReachMetersForProfile(profileId))
      expect(Number.isFinite(robotFootprint.reachMeters), preset.id).toBe(true)
    }
  })

  it('keeps every declared robot service target inside the reach envelope', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      const robotFootprint = footprints.find((candidate) => candidate.role === 'robot')
      if (!robotFootprint?.reachMeters) continue
      const limit = robotFootprint.reachMeters * DEFAULT_CELL_LAYOUT_REQUIREMENTS.robotReachToleranceRatio
      for (const target of footprints.filter((candidate) => candidate.robotService && candidate.id !== robotFootprint.id)) {
        const distance = distanceToBounds(robotFootprint.center.x, robotFootprint.center.z, footprintBounds(target))
        expect(distance, `${preset.id}: ${target.id}`).toBeLessThanOrEqual(limit + 1e-9)
      }
    }
  })

  it('keeps fencing outside the robot swept envelope plus the fence clearance', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      const robotFootprint = footprints.find((candidate) => candidate.role === 'robot')
      if (!robotFootprint?.reachMeters) continue
      const required = robotFootprint.reachMeters + DEFAULT_CELL_LAYOUT_REQUIREMENTS.fenceClearanceMeters
      for (const fence of footprints.filter((candidate) => candidate.definitionId.includes('fence'))) {
        const distance = distanceToBounds(robotFootprint.center.x, robotFootprint.center.z, footprintBounds(fence))
        expect(distance, `${preset.id}: ${fence.id}`).toBeGreaterThanOrEqual(required - 1e-9)
      }
    }
  })

  it('contains the robot swept envelope inside protective zones', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      const robotFootprint = footprints.find((candidate) => candidate.role === 'robot')
      if (!robotFootprint?.reachMeters) continue
      for (const zone of footprints.filter((candidate) => candidate.role === 'safety-zone')) {
        const bounds = footprintBounds(zone)
        if (bounds.maxX < robotFootprint.center.x || bounds.minX > robotFootprint.center.x) continue
        if (bounds.maxZ < robotFootprint.center.z || bounds.minZ > robotFootprint.center.z) continue
        const span = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
        expect(span, `${preset.id}: ${zone.id}`).toBeGreaterThanOrEqual(robotFootprint.reachMeters * 2 - 1e-9)
      }
    }
  })

  it('contains the full measured bounds in the derived overview camera', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      const layout = resolveCellLayout({ footprints })
      const containment = cameraContainsExtents(layout.cameras.overview, layout.extents)
      expect(containment.contains, `${preset.id}: ${JSON.stringify(containment)}`).toBe(true)
      expect(containment.maxAbsNdcX, preset.id).toBeLessThanOrEqual(1)
      expect(containment.maxAbsNdcY, preset.id).toBeLessThanOrEqual(1)
    }
  })

  it('derives deterministic operator and workcell views from scene data', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const footprints = cellFootprints(preset.cell)
      const layout = resolveCellLayout({ footprints })
      const again = deriveCameraPresets(layout.extents, footprints, { cameraMarginMeters: MARGIN })
      expect(again, preset.id).toEqual(layout.cameras)
      expect(layout.cameras.overview, preset.id).toEqual(layout.camera)
      expect(layout.cameras.operator, preset.id).not.toEqual(layout.cameras.overview)
      expect(layout.cameras.workcell, preset.id).not.toEqual(layout.cameras.overview)
      for (const view of ['overview', 'operator', 'workcell'] as const) {
        const framing = layout.cameras[view]
        expect(Number.isFinite(framing.position.x + framing.position.y + framing.position.z), `${preset.id}.${view}`).toBe(true)
        expect(Number.isFinite(framing.target.x + framing.target.y + framing.target.z), `${preset.id}.${view}`).toBe(true)
      }
    }
  })

  it('stores the derived cameras on every built-in preset', () => {
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const layout = resolveCellLayout({ footprints: cellFootprints(preset.cell) })
      expect(preset.camera, preset.id).toEqual(layout.cameras.overview)
      expect(preset.cameraPresets, preset.id).toEqual(layout.cameras)
      expect(preset.environment.floorSizeMeters, preset.id).toEqual(layout.floorSizeMeters)
    }
  })

  it('keeps a derived camera valid after millimetre rounding', () => {
    // Regression: rounding the camera position to mm must not drop below the strict framing distance.
    for (const preset of BUILT_IN_SCENE_PRESETS) {
      const layout = resolveCellLayout({ footprints: cellFootprints(preset.cell) })
      const distance = Math.hypot(
        layout.camera.position.x - layout.camera.target.x,
        layout.camera.position.y - layout.camera.target.y,
        layout.camera.position.z - layout.camera.target.z,
      )
      expect(distance, preset.id).toBeGreaterThanOrEqual(framingDistanceMeters(layout.extents, MARGIN) - 1e-9)
    }
  })
})

/**
 * Negative fixtures: each measured diagnostic must fire on a real violation.
 */
describe('S69 layout negative fixtures', () => {
  it('flags a gross equipment overlap', () => {
    const diagnostics = validateCellLayout({ footprints: [
      footprint({ id: 'a', role: 'machine', center: { x: 0, z: 0 }, size: { x: 1, z: 1 }, heightMeters: 2 }),
      footprint({ id: 'b', role: 'machine', center: { x: 0.4, z: 0 }, size: { x: 1, z: 1 }, heightMeters: 2, robotService: true }),
    ] })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'equipment-overlap' }))
  })

  it('flags equipment outside the declared floor', () => {
    const diagnostics = validateCellLayout({
      footprints: [footprint({ id: 'cnc', role: 'machine', center: { x: 5, z: 0 }, size: { x: 1, z: 1 }, heightMeters: 2 })],
      floorSizeMeters: { x: 4, z: 4 },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'equipment-outside-floor' }))
  })

  it('flags a robot service target outside the reach envelope', () => {
    const diagnostics = validateCellLayout({ footprints: [
      robot({ reachMeters: 0.8 }),
      footprint({ id: 'far', role: 'machine', center: { x: 4, z: 0 }, size: { x: 1, z: 1 }, heightMeters: 2, robotService: true }),
    ] })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'robot-unreachable' }))
  })

  it('flags a fence inside the robot swept envelope', () => {
    const diagnostics = validateCellLayout({ footprints: [
      robot({ reachMeters: 1.5 }),
      footprint({ id: 'fence-1', role: 'infrastructure', definitionId: 'fence-panel', center: { x: 0, z: 0.6 }, size: { x: 2.4, z: 0.06 }, heightMeters: 2.1 }),
    ] })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'fence-clearance' }))
  })

  it('flags tight service clearance, operator corridor and conveyor access', () => {
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

  it('flags a protective zone too small to contain the robot envelope', () => {
    const diagnostics = validateCellLayout({
      footprints: [
        robot({ reachMeters: 1.5 }),
        footprint({ id: 'zone-1', role: 'safety-zone', center: { x: 0, z: 0 }, size: { x: 2, z: 2 }, heightMeters: 0.02, floorMarking: true }),
      ],
      floorSizeMeters: { x: 8, z: 8 },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'safety-zone-too-small' }))
  })

  it('flags a camera that clips the measured bounds', () => {
    const diagnostics = validateCellLayout({
      footprints: [
        footprint({ id: 'a', role: 'machine', center: { x: -4, z: -4 }, size: { x: 1, z: 1 }, heightMeters: 2 }),
        footprint({ id: 'b', role: 'machine', center: { x: 4, z: 4 }, size: { x: 1, z: 1 }, heightMeters: 2 }),
      ],
      camera: { position: { x: 0.4, y: 0.4, z: 0.4 }, target: { x: 0, y: 0, z: 0 } },
    })
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'camera-clipping' }))
  })

  it('accepts a camera that contains the measured bounds', () => {
    const footprints = [
      footprint({ id: 'a', role: 'machine', center: { x: 0, z: 0 }, size: { x: 4, z: 2 }, heightMeters: 2 }),
    ]
    const layout = resolveCellLayout({ footprints })
    const diagnostics = validateCellLayout({ footprints, camera: deriveCameraPreset(layout.extents, { cameraMarginMeters: MARGIN }) })
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'camera-clipping')).toEqual([])
  })
})
