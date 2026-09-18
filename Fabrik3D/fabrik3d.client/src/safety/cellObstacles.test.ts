import { describe, expect, it } from 'vitest'
import { SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import { INDUSTRIAL_CONVEYOR_MANIFEST } from '../equipment/assets'
import { addPalletObstacle, createSingleCellWorld, palletObstacles } from './cellObstacles'
import { primitivesIntersect } from './collision'

describe('single-cell collision world', () => {
  it('derives CNC, conveyor, floor and safety-zone obstacles from the layout', () => {
    const world = createSingleCellWorld()
    const ids = world.obstacles.map((o) => o.id)
    expect(ids).toEqual(expect.arrayContaining(['cnc-1', 'conveyor-1', 'floor', 'pallet-infeed-zone']))
    expect(world.defaultMarginMeters).toBeGreaterThan(0)

    const cnc = world.obstacles.find((o) => o.id === 'cnc-1')!
    expect(cnc.primitive.kind).toBe('box')
    if (cnc.primitive.kind === 'box') {
      // CNC body centred at the configured position.
      expect(cnc.primitive.max.z).toBeGreaterThan(SINGLE_CELL_POSITIONS.cnc[2])
      expect(cnc.primitive.min.z).toBeLessThan(SINGLE_CELL_POSITIONS.cnc[2])
    }

    const conveyor = world.obstacles.find((o) => o.id === 'conveyor-1')!
    expect(conveyor.primitive.kind).toBe('box')
    if (conveyor.primitive.kind === 'box') {
      expect(conveyor.primitive.max.y).toBe(INDUSTRIAL_CONVEYOR_MANIFEST.collision.dimensionsMeters!.y)
      expect(conveyor.primitive.max.z - conveyor.primitive.min.z)
        .toBeCloseTo(INDUSTRIAL_CONVEYOR_MANIFEST.collision.dimensionsMeters!.z, 12)
    }
  })

  it('replaces the pallet rim obstacles when the pallet moves', () => {
    const world = addPalletObstacle(createSingleCellWorld(), 0.5)
    const pallets = world.obstacles.filter((o) => o.id === 'pallet-work-object')
    expect(pallets).toHaveLength(4)
    const moved = addPalletObstacle(world, -0.5)
    expect(moved.obstacles.filter((o) => o.id === 'pallet-work-object')).toHaveLength(4)
  })

  it('exposes a tool that enters the CNC body as colliding', () => {
    const world = createSingleCellWorld()
    const cnc = world.obstacles.find((o) => o.id === 'cnc-1')!.primitive
    // Tool deep inside the CNC body.
    const toolCapsule = {
      kind: 'capsule' as const,
      start: { x: 0, y: 1.0, z: SINGLE_CELL_POSITIONS.cnc[2] },
      end: { x: 0, y: 1.2, z: SINGLE_CELL_POSITIONS.cnc[2] },
      radius: 0.05,
    }
    expect(primitivesIntersect(toolCapsule, cnc, 0.02)).toBe(true)
  })

  it('builds pallet rim obstacles at the given world X', () => {
    const obstacles = palletObstacles(1.0)
    expect(obstacles).toHaveLength(4)
    for (const obstacle of obstacles) {
      expect(obstacle.id).toBe('pallet-work-object')
      expect(obstacle.primitive.kind).toBe('box')
    }
    // The four rails form a frame around the pallet footprint.
    const minXs = obstacles.map((o) => o.primitive.kind === 'box' ? o.primitive.min.x : 0)
    const maxXs = obstacles.map((o) => o.primitive.kind === 'box' ? o.primitive.max.x : 0)
    expect(Math.min(...minXs)).toBeCloseTo(0.7, 9)
    expect(Math.max(...maxXs)).toBeCloseTo(1.3, 9)
  })
})
