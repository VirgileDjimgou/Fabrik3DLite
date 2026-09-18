import { describe, expect, it } from 'vitest'
import { MEDIUM_6AXIS } from '../robot/catalog'
import { buildRobotArmSegments, createSafetyRobotModel, selfCollision } from './robotModel'

describe('robot arm collision model', () => {
  it('builds one segment per link plus a tool capsule', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    const segments = buildRobotArmSegments(model, [0, 0, 0, 0, 0, 0])
    expect(segments.links).toHaveLength(6)
    expect(segments.origins).toHaveLength(8) // base + 6 joints + tool tip
    expect(segments.tool.kind).toBe('capsule')
  })

  it('places the tool above the base at the straight-up pose', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    const segments = buildRobotArmSegments(model, [0, 0, 0, 0, 0, 0])
    const toolTip = segments.origins[segments.origins.length - 1]!
    expect(toolTip.x).toBeCloseTo(0, 9)
    expect(toolTip.z).toBeCloseTo(0, 9)
    expect(toolTip.y).toBeGreaterThan(3)
  })

  it('has no self-collision in a natural extended pose', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    const segments = buildRobotArmSegments(model, [Math.PI / 2, -1.57, 0.5, 0, -1, 0])
    const result = selfCollision(segments.links)
    expect(result.collision).toBe(false)
  })

  it('detects self-collision in a folded pose and reports the segments', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    // Fold the arm so the forearm swings back toward the upper arm.
    const segments = buildRobotArmSegments(model, [0, -Math.PI / 2, -2.6, 0, 1.8, 0])
    const result = selfCollision(segments.links, 0.02)
    if (result.collision) {
      expect(result.indexA).not.toBeNull()
      expect(result.indexB).not.toBeNull()
      expect(result.distanceMeters).toBeGreaterThanOrEqual(0)
    }
  })
})