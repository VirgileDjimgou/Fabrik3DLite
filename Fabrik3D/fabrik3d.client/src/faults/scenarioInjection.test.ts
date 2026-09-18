import { describe, expect, it } from 'vitest'
import { FaultController, injectScenarioFaults } from '.'
import { TimelineRecorder } from '../timeline'
import type { ScenarioDefinition } from '../scenarios/types'

describe('scenario fault injection', () => {
  it('reproduces declared scenario faults at scenario start', () => {
    const scenario = { id: 'fixture', faultInjections: ['communication-loss'] } as ScenarioDefinition
    const timeline = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z')
    const controller = new FaultController(timeline)
    injectScenarioFaults(scenario, controller, { source: 'scenario', sessionId: 's', equipmentId: 'simulator-1', correlationId: 'c' })
    expect(controller.activeFaults[0]).toMatchObject({ type: 'communication-loss', source: 'scenario' })
    expect(timeline.all[0]).toMatchObject({ kind: 'alarm', simulated: true, sessionId: 's', correlationId: 'c' })
  })
})
