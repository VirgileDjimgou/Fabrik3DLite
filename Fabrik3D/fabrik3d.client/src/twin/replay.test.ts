import { describe, expect, it } from 'vitest'
import { reconstructTwinStates } from './replay'
import { reconstructCell } from '../timeTravel/reconstruction'
import { createTimeTravelDemoInput } from '../timeTravel/demo'

describe('time-travel reconstruction through the normalized twin model', () => {
  it('emits replay-sourced states and never a command', () => {
    const snapshot = reconstructCell(createTimeTravelDemoInput(), '2026-01-01T08:00:06.000Z')
    const states = reconstructTwinStates(snapshot)
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((state) => state.source === 'replay')).toBe(true)

    const robot = states.find((state) => state.equipment.id === 'robot-1')
    expect(robot?.executionState).toBe('MOVE_TO_CNC_INSERT')
    expect(robot?.measurements.joints).toBeTypeOf('string')

    const cnc = states.find((state) => state.equipment.id === 'cnc-1')
    expect(cnc?.executionState).toBe('MACHINING')
    expect(cnc?.measurements.spindleRunning).toBe(true)
  })

  it('maps reconstruction exactness to explicit quality', () => {
    const exact = reconstructCell(createTimeTravelDemoInput(), '2026-01-01T08:00:06.000Z')
    expect(reconstructTwinStates(exact).find((state) => state.equipment.id === 'robot-1')?.quality).toBe('good')

    const gap = reconstructCell({ ...createTimeTravelDemoInput(), trajectory: [] }, '2026-01-01T08:00:06.000Z')
    const gapRobot = reconstructTwinStates(gap).find((state) => state.equipment.id === 'robot-1')
    expect(gapRobot?.availability).toBe('unavailable')
    expect(gapRobot?.quality).toBe('invalid')
  })
})
