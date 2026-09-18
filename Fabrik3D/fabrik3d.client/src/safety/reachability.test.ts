import { describe, expect, it } from 'vitest'
import { createCncTarget, createPalletSlotTarget } from '../kinematics'
import { COMPACT_6AXIS, HEAVY_6AXIS, MEDIUM_6AXIS, type RobotDefinition } from '../robot/catalog'
import { jointsWithinLimits, reachEnvelopeMeters, validateTargetReachability } from './reachability'
import { createSafetyRobotModel } from './robotModel'

const PALETTED_ROBOTS: RobotDefinition[] = [MEDIUM_6AXIS, HEAVY_6AXIS]

describe('reachability against reference cell targets', () => {
  it.each(PALETTED_ROBOTS)('accepts pallet and CNC targets within reach for %s', (profile) => {
    const model = createSafetyRobotModel(profile)
    const pallet = createPalletSlotTarget(0, 2, 2)
    const cnc = createCncTarget('approach')

    expect(validateTargetReachability(model, pallet.pose).ok).toBe(true)
    expect(validateTargetReachability(model, cnc.pose).ok).toBe(true)
  })

  it('reports the compact robot as unable to reach the CNC reference cell', () => {
    const model = createSafetyRobotModel(COMPACT_6AXIS)
    const cnc = createCncTarget('insert')
    const check = validateTargetReachability(model, cnc.pose)
    expect(check.ok).toBe(false)
    expect(check.diagnostics.status).toBe('unreachable')
    expect(check.diagnostics.message).toContain('reach envelope')
  })

  it('reports explicit reach envelopes per catalog robot', () => {
    expect(reachEnvelopeMeters(createSafetyRobotModel(COMPACT_6AXIS))).toBeLessThan(
      reachEnvelopeMeters(createSafetyRobotModel(MEDIUM_6AXIS)),
    )
    expect(reachEnvelopeMeters(createSafetyRobotModel(MEDIUM_6AXIS))).toBeLessThan(
      reachEnvelopeMeters(createSafetyRobotModel(HEAVY_6AXIS)),
    )
  })

  it('rejects a target expressed in a foreign frame', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    const pallet = createPalletSlotTarget(0, 2, 2)
    const check = validateTargetReachability(model, { ...pallet.pose, frameId: 'tool' })
    expect(check.ok).toBe(false)
    expect(check.diagnostics.status).toBe('invalid-target')
  })

  it('rejects a target below the base as unreachable', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    const check = validateTargetReachability(model, {
      frameId: 'world',
      position: { x: 0, y: -0.5, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    })
    expect(check.ok).toBe(false)
    expect(check.diagnostics.status).toBe('unreachable')
  })

  it('verifies joint values against declared limits', () => {
    const model = createSafetyRobotModel(MEDIUM_6AXIS)
    expect(jointsWithinLimits([0, 0, 0, 0, 0, 0], model.jointLimits).ok).toBe(true)
    const bad = jointsWithinLimits([0, 99, 0, 0, 0, 0], model.jointLimits)
    expect(bad.ok).toBe(false)
    expect(bad.index).toBe(1)
    expect(bad.limit).not.toBeNull()
  })
})