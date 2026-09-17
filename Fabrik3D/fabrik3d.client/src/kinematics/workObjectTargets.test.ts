import { describe, expect, it } from 'vitest'
import { FRAME_IDS, createCncTarget, createPalletSlotTarget, createSingleCellFrames } from '.'

describe('work-object targets', () => {
  it('expresses pallet slots as world targets with deterministic grid geometry', () => {
    const first = createPalletSlotTarget(0, 0, 0, 5, 5, 0.15)
    const last = createPalletSlotTarget(0, 4, 4, 5, 5)
    expect(first.pose.frameId).toBe(FRAME_IDS.world)
    expect(first.workObjectFrameId).toBe(FRAME_IDS.palletWorkObject)
    expect(first.pose.position.x).toBeCloseTo(-0.208, 8)
    expect(last.pose.position.x).toBeCloseTo(0.208, 8)
    expect(first.pose.position.z).toBeLessThan(last.pose.position.z)
    expect(() => createPalletSlotTarget(0, 5, 0)).toThrow('outside')
  })

  it('defines CNC insertion and static cell frames explicitly', () => {
    const frames = createSingleCellFrames()
    const cnc = createCncTarget('insert')
    expect(frames.map((frame) => frame.id)).toEqual(expect.arrayContaining([FRAME_IDS.world, FRAME_IDS.cell, FRAME_IDS.robotBase, FRAME_IDS.flange, FRAME_IDS.tool, FRAME_IDS.cncEquipment]))
    expect(cnc.workObjectFrameId).toBe(FRAME_IDS.cncWorkObject)
    expect(cnc.pose.frameId).toBe(FRAME_IDS.world)
    expect(cnc.pose.position.z).toBeCloseTo(2.5, 8)
  })
})
