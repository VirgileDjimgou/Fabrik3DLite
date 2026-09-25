import { describe, expect, it } from 'vitest'
import { FaultController, FaultLabController, injectScenarioFaults, readScenarioFaultOverlays, injectScenarioOverlays } from '.'
import { TimelineRecorder } from '../timeline'
import type { ScenarioDefinition } from '../scenarios/types'

const FIXED = () => '2026-01-01T00:00:00.000Z'

describe('scenario fault injection', () => {
  it('reproduces declared scenario faults at scenario start', () => {
    const scenario = { id: 'fixture', faultInjections: ['communication-loss'] } as ScenarioDefinition
    const timeline = new TimelineRecorder(FIXED)
    const controller = new FaultController(timeline)
    injectScenarioFaults(scenario, controller, { source: 'scenario', sessionId: 's', equipmentId: 'simulator-1', correlationId: 'c' })
    expect(controller.activeFaults[0]).toMatchObject({ type: 'communication-loss', source: 'scenario' })
    expect(timeline.all[0]).toMatchObject({ kind: 'alarm', simulated: true, sessionId: 's', correlationId: 'c' })
  })
})

describe('scenario overlay injection compatibility', () => {
  it('reads a pre-S38 scenario without the additive field as empty', () => {
    const scenario = { id: 'legacy' } as ScenarioDefinition
    const reader = readScenarioFaultOverlays(scenario)
    expect(reader.overlays).toEqual([])
    expect(reader.diagnostics).toEqual([])
  })

  it('reads valid versioned overlay specs', () => {
    const scenario = {
      id: 'modern',
      faultOverlays: [
        { type: 'noisy-analog', equipmentId: 'cnc-1', signalIds: ['cnc-1.SpindleSpeed'], seed: 5, magnitude: 0.1 },
        { type: 'actuator-jam', equipmentId: 'robot-1' },
      ],
    } as ScenarioDefinition
    const reader = readScenarioFaultOverlays(scenario)
    expect(reader.overlays).toHaveLength(2)
    expect(reader.diagnostics).toEqual([])
  })

  it('drops unknown overlay classes with a diagnostic instead of guessing', () => {
    const scenario = {
      id: 'bad',
      faultOverlays: [{ type: 'not-a-fault', equipmentId: 'cnc-1' }],
    } as unknown as ScenarioDefinition
    const reader = readScenarioFaultOverlays(scenario)
    expect(reader.overlays).toEqual([])
    expect(reader.diagnostics[0]).toContain('unsupported type')
  })

  it('injects scenario overlays through the fault lab at scenario start', () => {
    const scenario = {
      id: 'modern',
      faultOverlays: [{ type: 'inverted', equipmentId: 'conveyor-1', signalIds: ['conveyor-1.PhotoeyeStation'], seed: 3 }],
    } as ScenarioDefinition
    const timeline = new TimelineRecorder(FIXED)
    const lab = new FaultLabController(timeline, undefined, FIXED)
    const diagnostics = injectScenarioOverlays(scenario, lab, { source: 'scenario', sessionId: 's', equipmentId: 'conveyor-1', correlationId: 'c' })
    expect(diagnostics).toEqual([])
    expect(lab.activeOverlays[0]).toMatchObject({ type: 'inverted', source: 'scenario' })
  })
})
