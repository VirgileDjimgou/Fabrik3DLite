import { describe, expect, it } from 'vitest'
import {
  BELT_MARKER_TRAVEL_METERS,
  DECLARED_CONVEYOR_SPEED_MPS,
  DRESS_PACK_MAX_FLEX_RADIANS,
  GRIPPER_FINGER_CLOSED_METERS,
  GRIPPER_FINGER_OPEN_METERS,
  advanceBeltOffset,
  dressPackFlex,
  gripperFingerGap,
  robotBeaconSignal,
} from './stateDrivenMotion'

describe('S75 state-driven motion helpers', () => {
  it('interpolates the gripper finger gap from the holding state', () => {
    // Open -> closed: starts open, ends closed.
    expect(gripperFingerGap(false, true, 0)).toBeCloseTo(GRIPPER_FINGER_OPEN_METERS, 6)
    expect(gripperFingerGap(false, true, 1)).toBeCloseTo(GRIPPER_FINGER_CLOSED_METERS, 6)
    expect(gripperFingerGap(false, true, 0.5)).toBeCloseTo(
      (GRIPPER_FINGER_OPEN_METERS + GRIPPER_FINGER_CLOSED_METERS) / 2,
      6,
    )
    // Closed -> open is the mirror image.
    expect(gripperFingerGap(true, false, 1)).toBeCloseTo(GRIPPER_FINGER_OPEN_METERS, 6)
    // Out-of-range transition factors are clamped.
    expect(gripperFingerGap(false, true, 5)).toBeCloseTo(GRIPPER_FINGER_CLOSED_METERS, 6)
    expect(gripperFingerGap(false, true, -5)).toBeCloseTo(GRIPPER_FINGER_OPEN_METERS, 6)
  })

  it('advances the belt offset proportionally to speed and time', () => {
    const advanced = advanceBeltOffset(0, DECLARED_CONVEYOR_SPEED_MPS, 1)
    expect(advanced).toBeCloseTo(DECLARED_CONVEYOR_SPEED_MPS, 6)
    expect(advanceBeltOffset(0, 1, 0.5)).toBeCloseTo(0.5, 6)
  })

  it('produces no belt motion when the conveyor is stopped', () => {
    expect(advanceBeltOffset(0.4, 0, 10)).toBe(0.4)
    expect(advanceBeltOffset(0.4, -1, 10)).toBe(0.4)
    expect(advanceBeltOffset(0.4, 1, 0)).toBe(0.4)
  })

  it('wraps the belt offset inside the declared travel distance', () => {
    const wrapped = advanceBeltOffset(BELT_MARKER_TRAVEL_METERS - 0.1, 1, 0.5)
    expect(wrapped).toBeGreaterThanOrEqual(0)
    expect(wrapped).toBeLessThan(BELT_MARKER_TRAVEL_METERS)
    expect(wrapped).toBeCloseTo(0.4, 6)
  })

  it('bounds the dress-pack flex from the robot pose', () => {
    expect(dressPackFlex([])).toBe(0)
    expect(dressPackFlex([0, 0, 0])).toBe(0)
    expect(dressPackFlex([1, 1, 1])).toBeCloseTo(0.15, 6)
    expect(dressPackFlex([100, 100, 100])).toBeCloseTo(DRESS_PACK_MAX_FLEX_RADIANS, 6)
    expect(dressPackFlex([-100, -100, -100])).toBeCloseTo(-DRESS_PACK_MAX_FLEX_RADIANS, 6)
  })

  it('derives the robot-base beacon from authoritative robot state', () => {
    expect(robotBeaconSignal({ lifecycle: 'idle', fault: false, emergencyStop: false })).toBe('off')
    expect(robotBeaconSignal({ lifecycle: 'running', fault: false, emergencyStop: false })).toBe('running')
    expect(robotBeaconSignal({ lifecycle: 'running', fault: true, emergencyStop: false })).toBe('fault')
    expect(robotBeaconSignal({ lifecycle: 'idle', fault: false, emergencyStop: true })).toBe('fault')
  })
})
