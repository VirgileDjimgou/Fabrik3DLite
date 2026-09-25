import { describe, expect, it } from 'vitest'
import {
  ConveyorPalletFlow,
  ENCODER_PULSES_PER_METER,
  MAX_CONVEYOR_SPEED_METERS_PER_SECOND,
} from './ConveyorPalletFlow'

function createFlow(overrides: Partial<ConstructorParameters<typeof ConveyorPalletFlow>[0]> = {}): ConveyorPalletFlow {
  return new ConveyorPalletFlow({ spawnX: -4, stopX: -1, speed: 0.5, spawnInterval: 100, direction: 1, ...overrides })
}

describe('ConveyorPalletFlow signal-facing state', () => {
  it('stops and resumes pallet movement with the run command', () => {
    const flow = createFlow()
    flow.update(0.1)
    const startX = flow.pallets[0]!.worldX

    expect(flow.setRunCommand(false)).toBe(true)
    flow.update(1)
    expect(flow.pallets[0]!.worldX).toBe(startX)
    expect(flow.isRunning).toBe(false)
    expect(flow.actualSpeedMetersPerSecond).toBe(0)

    expect(flow.setRunCommand(true)).toBe(true)
    flow.update(1)
    expect(flow.pallets[0]!.worldX).toBeGreaterThan(startX)
    expect(flow.actualSpeedMetersPerSecond).toBe(0.5)
  })

  it('clamps the speed reference and rejects non-finite values', () => {
    const flow = createFlow()
    expect(flow.setSpeedReference(10)).toBe(true)
    expect(flow.speedReferenceMetersPerSecond).toBe(MAX_CONVEYOR_SPEED_METERS_PER_SECOND)
    expect(flow.setSpeedReference(-1)).toBe(true)
    expect(flow.speedReferenceMetersPerSecond).toBe(0)
    expect(flow.setSpeedReference(Number.NaN)).toBe(false)
    expect(flow.setSpeedReference(0.75)).toBe(true)
    expect(flow.actualSpeedMetersPerSecond).toBe(0.75)
  })

  it('accumulates encoder pulses from real movement and stops when the belt stops', () => {
    const flow = createFlow()
    flow.update(0.1)
    expect(flow.encoderPulseCount).toBeCloseTo(0.5 * 0.1 * ENCODER_PULSES_PER_METER, 6)

    flow.setRunCommand(false)
    const pulses = flow.encoderPulseCount
    flow.update(1)
    expect(flow.encoderPulseCount).toBe(pulses)

    flow.resetEncoder()
    expect(flow.encoderPulseCount).toBe(0)
  })

  it('derives infeed and station photoeyes from real pallet positions', () => {
    const flow = createFlow({ speed: 1 })
    flow.update(0.01)
    expect(flow.photoeyeIn).toBe(false)
    expect(flow.photoeyeStation).toBe(false)

    for (let step = 0; step < 25; step += 1) flow.update(0.1)
    expect(flow.photoeyeIn).toBe(true)
    expect(flow.photoeyeStation).toBe(false)

    flow.update(1)
    expect(flow.photoeyeStation).toBe(true)
    expect(flow.pallets[0]!.state).toBe('stopped')
  })

  it('does not advance a moving pallet while stopped even with a speed reference', () => {
    const flow = createFlow({ speed: 1 })
    flow.update(0.01)
    const startX = flow.pallets[0]!.worldX
    flow.setSpeedReference(2)
    flow.setRunCommand(false)
    flow.update(5)
    expect(flow.pallets[0]!.worldX).toBe(startX)
    expect(flow.actualSpeedMetersPerSecond).toBe(0)
  })
})
