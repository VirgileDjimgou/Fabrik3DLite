import { describe, expect, it } from 'vitest'
import { TimeTravelController } from './controller'
import { createTimeTravelDemoInput } from './demo'

const T0 = Date.parse('2026-01-01T08:00:00.000Z')

function controller() {
  return new TimeTravelController(createTimeTravelDemoInput(), { stepMs: 1000, startTime: new Date(T0).toISOString() })
}

describe('time-travel controller', () => {
  it('exposes the full recorded window and derived markers', () => {
    const tt = controller()
    expect(tt.rangeMs.startMs).toBe(T0)
    expect(tt.rangeMs.endMs).toBe(T0 + 18_000)
    expect(tt.markers.map((marker) => marker.kind)).toEqual(
      expect.arrayContaining(['command', 'phase', 'alarm', 'fault']),
    )
  })

  it('is deterministic regardless of input record order', () => {
    const input = createTimeTravelDemoInput()
    const reversed = { ...input, records: [...input.records].reverse() }
    const a = new TimeTravelController(input, { startTime: new Date(T0 + 9000).toISOString() })
    const b = new TimeTravelController(reversed, { startTime: new Date(T0 + 9000).toISOString() })
    expect(a.snapshot()).toEqual(b.snapshot())
  })

  it('advances frame-rate independently for the same logical delta', () => {
    const coarse = controller()
    const fine = controller()
    coarse.play()
    fine.play()
    coarse.advance(2000)
    fine.advance(700)
    fine.advance(800)
    fine.advance(500)
    expect(fine.cursorMs).toBe(coarse.cursorMs)
    expect(fine.snapshot()).toEqual(coarse.snapshot())
  })

  it('applies speed to logical advances and clamps at the window end', () => {
    const tt = controller()
    tt.play()
    tt.setSpeed(2)
    tt.advance(1000)
    expect(tt.cursorMs).toBe(T0 + 2000)
    tt.advance(60_000)
    expect(tt.cursorMs).toBe(T0 + 18_000)
    expect(tt.isPlaying).toBe(false)
  })

  it('steps by a fixed logical step and pauses playback', () => {
    const tt = controller()
    tt.play()
    tt.stepForward()
    expect(tt.isPlaying).toBe(false)
    expect(tt.cursorMs).toBe(T0 + 1000)
    tt.stepBackward()
    expect(tt.cursorMs).toBe(T0)
    tt.stepBackward()
    expect(tt.cursorMs).toBe(T0)
  })

  it('jumps to an event marker and reconstructs that event', () => {
    const tt = controller()
    const alarm = tt.markers.find((marker) => marker.kind === 'alarm')
    expect(alarm).toBeDefined()
    const snapshot = tt.jumpToMarker(alarm!)
    expect(snapshot.targetTime).toBe(alarm!.timestamp)
    expect(snapshot.alarms.some((entry) => entry.alarmId === 'alarm-1')).toBe(true)
  })

  it('restarts from the beginning when play is pressed at the end', () => {
    const tt = controller()
    tt.seekMs(T0 + 18_000)
    tt.play()
    expect(tt.cursorMs).toBe(T0)
    expect(tt.isPlaying).toBe(true)
  })

  it('never exposes a command interface on the snapshot', () => {
    const snapshot = controller().snapshot()
    expect(snapshot.readOnly).toBe(true)
    expect(Object.keys(snapshot)).not.toContain('commands')
  })
})
