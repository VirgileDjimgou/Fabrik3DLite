import { describe, expect, it } from 'vitest'
import { FaultController, getFaultDefinition } from '.'
import { TimelineRecorder } from '../timeline'

const context = { source: 'instructor', sessionId: 'session-1', equipmentId: 'robot-1', correlationId: 'corr-1' }
describe('FaultController', () => {
  it.each(['collision-risk', 'unreachable-target', 'cnc-fault', 'conveyor-blockage', 'missing-pallet', 'stale-heartbeat', 'communication-loss'] as const)('latches and acknowledges %s', type => {
    const controller = new FaultController(new TimelineRecorder(() => '2026-01-01T00:00:00.000Z'))
    const fault = controller.inject(getFaultDefinition(type), 'instructor', context)
    expect(controller.activeFaults).toHaveLength(1)
    controller.act(fault.id, 'acknowledge', context)
    expect(controller.activeFaults[0]?.acknowledgedAt).toBeDefined()
  })

  it('cannot retry a reset-required fault before acknowledgement and reset', () => {
    const controller = new FaultController(new TimelineRecorder())
    const fault = controller.inject(getFaultDefinition('cnc-fault'), 'instructor', context)
    expect(() => controller.act(fault.id, 'retry', context)).toThrow('acknowledged')
    controller.act(fault.id, 'acknowledge', context)
    expect(() => controller.act(fault.id, 'retry', context)).toThrow('reset')
    controller.act(fault.id, 'reset', context)
    controller.act(fault.id, 'retry', context)
    expect(controller.activeFaults).toHaveLength(0)
  })
})
