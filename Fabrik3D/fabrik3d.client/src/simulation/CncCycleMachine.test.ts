import { describe, expect, it } from 'vitest'
import {
  CncCycleMachine,
  DEFAULT_CNC_CYCLE_TIMINGS,
  FEED_NOMINAL_MM_PER_MIN,
  SPINDLE_NOMINAL_RPM,
  isClampPhase,
  isMachiningPhase,
  isSpindlePhase,
  timingsForMachiningDuration,
  totalMachiningSeconds,
  type CncCyclePhase,
} from './CncCycleMachine'

/** Steps the machine with fixed 20 ms frames and returns the phase trace. */
function run(machine: CncCycleMachine, seconds: number, dt = 0.02): CncCyclePhase[] {
  const trace: CncCyclePhase[] = []
  const steps = Math.round(seconds / dt)
  for (let index = 0; index < steps; index += 1) {
    machine.update(dt)
    if (trace[trace.length - 1] !== machine.phase) trace.push(machine.phase)
  }
  return trace
}

describe('CncCycleMachine', () => {
  it('runs the complete load → clamp → spindle → feed → unload sequence', () => {
    const machine = new CncCycleMachine()
    expect(machine.coarseState).toBe('IDLE')
    expect(machine.loadPart()).toBe(true)
    expect(machine.coarseState).toBe('LOADING')

    run(machine, 1.0)
    expect(machine.phase).toBe('LOAD_READY')
    expect(machine.doorOpen).toBe(true)
    expect(machine.spindleSpeed).toBe(0)

    expect(machine.startMachining()).toBe(true)
    expect(machine.partPresent).toBe(true)
    expect(machine.coarseState).toBe('MACHINING')

    let sawFeed = false
    let sawClamped = false
    let sawSpindleAtSpeed = false
    const dt = 0.02
    for (let index = 0; index < 500 && machine.phase !== 'UNLOAD_READY'; index += 1) {
      machine.update(dt)
      if (machine.phase === 'FEED') {
        sawFeed = true
        if (machine.coolantOn) sawClamped = sawClamped || machine.fixtureClamped
        sawSpindleAtSpeed = sawSpindleAtSpeed || machine.spindleAtSpeed
      }
    }

    expect(sawFeed).toBe(true)
    expect(sawClamped).toBe(true)
    expect(sawSpindleAtSpeed).toBe(true)
    expect(machine.phase).toBe('UNLOAD_READY')
    expect(machine.coarseState).toBe('UNLOADING')
    expect(machine.feedRate).toBe(0)
    expect(machine.spindleSpeed).toBe(0)
    expect(machine.fixtureClamped).toBe(false)
    expect(machine.doorOpen).toBe(true)
    expect(machine.partPresent).toBe(true)

    expect(machine.unloadComplete()).toBe(true)
    expect(machine.phase).toBe('IDLE')
    expect(machine.partPresent).toBe(false)
  })

  it('ramps the spindle through nominal speed and never opens the door while cutting', () => {
    const machine = new CncCycleMachine()
    machine.loadPart()
    run(machine, 1.0)
    machine.startMachining()
    expect(machine.doorClosed).toBe(false)

    const trace = run(machine, totalMachiningSeconds(), 0.02)
    expect(trace).toContain('CLAMPING')
    expect(trace).toContain('SPINDLE_RAMP_UP')
    expect(trace).toContain('FEED')
    expect(trace).toContain('SPINDLE_RAMP_DOWN')
    expect(trace).toContain('UNCLAMPING')

    // Re-run while sampling that the door never leaves the closed position mid-cycle.
    const second = new CncCycleMachine()
    second.loadPart()
    run(second, 1.0)
    second.startMachining()
    for (let index = 0; index < 400 && isMachiningPhase(second.phase); index += 1) {
      second.update(0.02)
      if (isSpindlePhase(second.phase) || isClampPhase(second.phase)) {
        expect(second.doorPosition).toBe(0)
      }
    }
  })

  it('refuses commands that violate the interlock sequence', () => {
    const machine = new CncCycleMachine()
    expect(machine.startMachining()).toBe(false)
    expect(machine.unloadComplete()).toBe(false)
    expect(machine.commandDoor(true)).toBe(true)

    run(machine, 1.0)
    expect(machine.phase).toBe('LOAD_READY')
    expect(machine.loadPart()).toBe(false)
    expect(machine.unloadComplete()).toBe(false)
    expect(machine.commandDoor(false)).toBe(true)
    expect(machine.phase).toBe('LOAD_CLOSING')
    run(machine, 1.0)
    expect(machine.phase).toBe('IDLE')
    expect(machine.partPresent).toBe(false)
  })

  it('freezes on emergency stop and only recovers through reset', () => {
    const machine = new CncCycleMachine()
    machine.loadPart()
    run(machine, 1.0)
    machine.startMachining()
    machine.update(0.02)
    const frozenPhase = machine.phase

    machine.setEmergencyStop(true)
    expect(machine.doorLocked).toBe(false)
    expect(machine.startMachining()).toBe(false)
    machine.update(1.0)
    expect(machine.phase).toBe(frozenPhase)

    machine.setEmergencyStop(false)
    expect(machine.emergencyStop).toBe(false)
    machine.reset()
    expect(machine.phase).toBe('IDLE')
    expect(machine.emergencyStop).toBe(false)
    expect(machine.doorClosed).toBe(true)
  })

  it('latches a fault and clears to idle deterministically', () => {
    const machine = new CncCycleMachine()
    machine.setFault(true)
    expect(machine.faulted).toBe(true)
    expect(machine.loadPart()).toBe(false)
    machine.update(0.5)
    expect(machine.phase).toBe('IDLE')
    machine.setFault(false)
    expect(machine.faulted).toBe(false)
    expect(machine.phase).toBe('IDLE')
  })

  it('scales the feed phase so the whole cycle matches the requested duration', () => {
    const timings = timingsForMachiningDuration(5)
    expect(totalMachiningSeconds(timings)).toBeCloseTo(5, 6)
    const machine = new CncCycleMachine(timings)

    machine.loadPart()
    run(machine, 1.0)
    machine.startMachining()

    let elapsed = 0
    const dt = 0.01
    while (machine.phase !== 'UNLOAD_READY' && elapsed < 20) {
      machine.update(dt)
      elapsed += dt
    }
    // Door re-open for unload happens after the cutting cycle, so the cutting
    // portion itself is exactly the configured feed budget.
    expect(elapsed).toBeGreaterThan(5)
    expect(elapsed).toBeLessThan(6.5)
    expect(DEFAULT_CNC_CYCLE_TIMINGS.doorTravelSeconds).toBeGreaterThan(0)
  })

  it('produces an identical snapshot for identical inputs', () => {
    const build = () => {
      const machine = new CncCycleMachine()
      machine.loadPart()
      run(machine, 1.0)
      machine.startMachining()
      for (let index = 0; index < 120; index += 1) machine.update(0.02)
      return machine.snapshot()
    }
    expect(build()).toEqual(build())
  })

  it('exposes nominal simulated cutting values while feeding', () => {
    const machine = new CncCycleMachine()
    machine.loadPart()
    run(machine, 1.0)
    machine.startMachining()
    while (machine.phase !== 'FEED') machine.update(0.02)
    machine.update(0.02)
    expect(machine.spindleSpeed).toBe(SPINDLE_NOMINAL_RPM)
    expect(machine.feedRate).toBe(FEED_NOMINAL_MM_PER_MIN)
    expect(machine.feedActive).toBe(true)
    expect(machine.coolantOn).toBe(true)
    expect(machine.cycleStep).toBe(6)
  })
})
