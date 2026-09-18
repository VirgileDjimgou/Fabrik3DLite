import { describe, expect, it } from 'vitest'
import type { EditorPlacement } from './editorTypes'
import { aabbsOverlap, findOverlaps, hasInvalidOverlap, placementAabb } from './overlap'

function placement(overrides: Partial<EditorPlacement> = {}): EditorPlacement {
  return {
    id: 'p',
    kind: 'robot',
    definitionId: 'medium-6axis',
    label: 'Robot',
    x: 0,
    z: 0,
    rotationRad: 0,
    width: 1,
    depth: 1,
    ...overrides,
  }
}

describe('placement geometry and overlap detection', () => {
  it('computes AABBs centred on the placement', () => {
    const box = placementAabb(placement({ x: 2, z: 3, width: 2, depth: 4 }))
    expect(box).toEqual({ minX: 1, maxX: 3, minZ: 1, maxZ: 5 })
  })

  it('detects overlapping and separated AABBs', () => {
    const a = placementAabb(placement({ x: 0, z: 0, width: 2, depth: 2 }))
    const b = placementAabb(placement({ x: 1.5, z: 0, width: 2, depth: 2 }))
    const far = placementAabb(placement({ x: 5, z: 5, width: 2, depth: 2 }))
    expect(aabbsOverlap(a, b)).toBe(true)
    expect(aabbsOverlap(a, far)).toBe(false)
  })

  it('reports pallet-on-conveyor as a valid (allowed) overlap', () => {
    const conveyor = placement({ id: 'conveyor-1', kind: 'conveyor', x: 0, z: 0, width: 6, depth: 0.6 })
    const pallet = placement({ id: 'pallet-1', kind: 'pallet-station', x: 0, z: 0, width: 0.6, depth: 0.6 })
    const report = findOverlaps([conveyor, pallet])
    expect(report).toHaveLength(1)
    expect(report[0]!.invalid).toBe(false)
  })

  it('flags robot/CNC overlap as invalid', () => {
    const robot = placement({ id: 'robot-1', kind: 'robot', x: 0, z: 0, width: 1.2, depth: 1.2 })
    const cnc = placement({ id: 'cnc-1', kind: 'cnc', x: 0, z: 0.5, width: 2, depth: 1.6 })
    const report = findOverlaps([robot, cnc])
    expect(report).toHaveLength(1)
    expect(report[0]!.invalid).toBe(true)
    expect(hasInvalidOverlap('robot-1', [robot, cnc])).toBe(true)
    expect(hasInvalidOverlap('cnc-1', [robot, cnc])).toBe(true)
  })

  it('ignores non-overlapping placements', () => {
    const robot = placement({ id: 'robot-1', kind: 'robot', x: 0, z: 0 })
    const cnc = placement({ id: 'cnc-1', kind: 'cnc', x: 0, z: 3.4, width: 2, depth: 1.6 })
    expect(findOverlaps([robot, cnc])).toHaveLength(0)
  })
})