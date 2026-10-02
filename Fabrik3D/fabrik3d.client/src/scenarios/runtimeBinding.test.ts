import { describe, expect, it } from 'vitest'
import { SCENARIO_CATALOG, getScenario } from './catalog'
import { ScenarioRunner } from './runner'
import {
  createScenarioEventProgram,
  idleScenarioProgress,
  runScenarioEventProgram,
  runScenarioEvents,
  scenarioExpectedEventSequence,
} from './runtimeBinding'

describe('S58 scenario runtime binding', () => {
  it('derives expected events in declared activity order', () => {
    const scenario = getScenario('sorting-normal-cycle')
    expect(scenarioExpectedEventSequence(scenario).map(event => event.type))
      .toEqual(['scenario.ready', 'sorting.complete', 'scenario.recovered'])
  })

  it('splits the program like the historical material-flow host', () => {
    const program = createScenarioEventProgram(getScenario('sorting-jam-recovery'))
    expect(program.run.map(event => event.type)).toEqual(['scenario.ready', 'sorting.recovered'])
    expect(program.recovery.map(event => event.type)).toEqual(['scenario.recovered'])
  })

  it('completes every catalog scenario deterministically and matches observing each expected event', () => {
    for (const scenario of SCENARIO_CATALOG) {
      const baseline = new ScenarioRunner(scenario)
      baseline.start()
      for (const event of scenarioExpectedEventSequence(scenario)) baseline.observe(event)

      const program = runScenarioEventProgram(scenario)
      expect(program.status, scenario.id).toBe('completed')
      expect(program.completedActivityIds, scenario.id).toEqual(baseline.getState().completedActivityIds)
      expect(program.progressPercent, scenario.id).toBe(100)
    }
  })

  it('produces identical results across repeated runs', () => {
    const scenario = getScenario('assembly-inspection-cycle')
    const first = runScenarioEvents(scenario, scenarioExpectedEventSequence(scenario))
    const second = runScenarioEvents(scenario, scenarioExpectedEventSequence(scenario))
    expect(second).toEqual(first)
  })

  it('reports idle progress with the activity total', () => {
    const scenario = getScenario('safety-door-recovery')
    expect(idleScenarioProgress(scenario, scenario.id)).toMatchObject({
      status: 'idle',
      progressPercent: 0,
      totalActivities: scenario.activities.length,
    })
    expect(idleScenarioProgress(null, 'missing')).toMatchObject({ scenarioId: 'missing', totalActivities: 0 })
  })
})
