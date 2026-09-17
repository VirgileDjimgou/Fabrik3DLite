import { describe, expect, it } from 'vitest'
import { COMPACT_6AXIS, HEAVY_6AXIS, MEDIUM_6AXIS } from '../robot/catalog'
import { createRobotKinematics } from './robotKinematics'
import { SerialDhKinematics } from './SerialDhKinematics'

describe('profile kinematics', () => {
  it.each([
    [COMPACT_6AXIS, { x: 0.65, y: 0, z: 1.1 }],
    [MEDIUM_6AXIS, { x: 0.98, y: 0, z: 1.45 }],
    [HEAVY_6AXIS, { x: 1.3, y: 0, z: 1.8 }],
  ])('matches the zero-pose FK reference for %s', (profile, expected) => {
    const pose = createRobotKinematics(profile).forward([0, 0, 0, 0, 0, 0])
    expect(pose.position.x).toBeCloseTo(expected.x, 8)
    expect(pose.position.y).toBeCloseTo(expected.y, 8)
    expect(pose.position.z).toBeCloseTo(expected.z, 8)
  })

  it.each([COMPACT_6AXIS, MEDIUM_6AXIS, HEAVY_6AXIS])('round-trips a reachable pose through IK for %s', (profile) => {
    const model = createRobotKinematics(profile)
    const referenceJoints = [0.25, -0.45, 0.55, 0.15, -0.35, 0.25]
    const target = model.forward(referenceJoints)
    const result = model.inverse(target, { initialJointsRad: referenceJoints.map((value) => value * 0.8) })

    expect(result.diagnostics.status).toBe('converged')
    expect(result.jointsRad).not.toBeNull()
    const actual = model.forward(result.jointsRad!)
    expect(Math.hypot(actual.position.x - target.position.x, actual.position.y - target.position.y, actual.position.z - target.position.z)).toBeLessThanOrEqual(0.003)
  })

  it('reports invalid, unreachable, and singular targets without returning a misleading motion', () => {
    const model = createRobotKinematics(COMPACT_6AXIS)
    expect(model.inverse({ ...model.forward([0, 0, 0, 0, 0, 0]), frameId: 'tool' }).diagnostics.status).toBe('invalid-target')
    expect(model.inverse({ ...model.forward([0, 0, 0, 0, 0, 0]), position: { x: 99, y: 99, z: 99 } }).diagnostics.status).toBe('unreachable')

    const singular = new SerialDhKinematics('singular', Array.from({ length: 6 }, () => ({ thetaOffsetRad: 0, dMeters: 0, aMeters: 0, alphaRad: 0 })), Array.from({ length: 6 }, () => ({ min: -1, max: 1 })))
    const result = singular.inverse({ frameId: 'world', position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })
    expect(result.diagnostics.status).toBe('singular')
    expect(result.jointsRad).toBeNull()
  })

  it('solves representative targets within a small development benchmark', () => {
    const model = createRobotKinematics(MEDIUM_6AXIS)
    const target = model.forward([0.2, -0.4, 0.5, 0.1, -0.3, 0.2])
    const started = performance.now()
    for (let index = 0; index < 20; index++) model.inverse(target)
    expect(performance.now() - started).toBeLessThan(1500)
  })
})
