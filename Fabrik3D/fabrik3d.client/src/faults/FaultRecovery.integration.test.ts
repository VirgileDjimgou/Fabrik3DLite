import { describe, expect, it } from 'vitest'
import { FaultController, getFaultDefinition } from '.'
import { TimelineRecorder } from '../timeline'

const context = { source: 'instructor', sessionId: 'learner-session', equipmentId: 'simulator-1', correlationId: 'learner-correlation' }
describe('learner fault recovery journeys', () => {
  it.each([
    ['collision-risk', true],
    ['missing-pallet', false],
    ['communication-loss', true],
  ] as const)('requires the complete recovery journey for %s', (type, requiresReset) => {
    const timeline = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z')
    const controller = new FaultController(timeline)
    let resumed = 0
    controller.onRetryRequested = () => { resumed += 1 }
    const fault = controller.inject(getFaultDefinition(type), 'instructor', context)
    expect(() => controller.act(fault.id, 'retry', context)).toThrow()
    controller.act(fault.id, 'acknowledge', context)
    if (requiresReset) controller.act(fault.id, 'reset', context)
    controller.act(fault.id, 'retry', context)
    expect(controller.activeFaults).toHaveLength(0)
    expect(resumed).toBe(1)
  })
})
