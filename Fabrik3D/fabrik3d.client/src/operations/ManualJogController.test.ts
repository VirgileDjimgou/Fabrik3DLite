import { describe, expect, it, vi } from 'vitest'
import { ManualJogController } from './ManualJogController'
describe('ManualJogController', () => {
  const safety = { checkMotion: vi.fn(() => ({ blocked: false })) } as any
  it('requires held input, clamps axis limits, and times out', () => { let time = 0; const joints = [Math.PI - .01, 0, 0, 0, 0, 0]; const jog = new ManualJogController(() => joints, (axis, value) => { joints[axis] = value }, safety, () => time, 100); expect(jog.tick()).toBe(false); jog.press(0, 1); expect(jog.tick()).toBe(true); expect(joints[0]).toBe(Math.PI); time = 101; expect(jog.tick()).toBe(false) })
  it('releases when safety blocks a jog', () => { safety.checkMotion.mockReturnValueOnce({ blocked: true }); const jog = new ManualJogController(() => [0,0,0,0,0,0], () => {}, safety); jog.press(0, 1); expect(jog.tick()).toBe(false); expect(jog.tick()).toBe(false) })
})
