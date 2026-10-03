import { describe, expect, it } from 'vitest'
import { getScenario } from './catalog'
import {
  buildScenarioProcess,
  DEFAULT_STAGE_DURATION_SECONDS,
  hasStagedProcess,
  runScenarioProcess,
  ScenarioProcessDriver,
  scenarioProcessEventSequence,
  type ScenarioProcessDefinition,
} from './scenarioProcess'
import { createScenarioEventProgram } from './runtimeBinding'
import type { ScenarioEvent } from './types'

const MATERIAL_FLOW_SCENARIOS = [
  'sorting-normal-cycle',
  'sorting-jam-recovery',
  'palletizing-normal-cycle',
  'palletizing-vacuum-recovery',
  'assembly-inspection-cycle',
  'safety-door-recovery',
] as const

const FAULT_SCENARIOS = ['sorting-jam-recovery', 'palletizing-vacuum-recovery', 'safety-door-recovery'] as const

function collect(definition: ScenarioProcessDefinition, options: { continuous?: boolean } = {}): {
  driver: ScenarioProcessDriver
  events: ScenarioEvent[]
} {
  const events: ScenarioEvent[] = []
  const driver = new ScenarioProcessDriver(definition, {
    continuous: options.continuous ?? false,
    onEvent: event => events.push(event),
  })
  return { driver, events }
}

describe('S67 scenario process definition', () => {
  it.each(MATERIAL_FLOW_SCENARIOS)('derives ordered, non-instantaneous stages for %s', (id) => {
    const scenario = getScenario(id)
    const definition = buildScenarioProcess(scenario)
    expect(definition.scenarioId).toBe(id)
    // One timed stage per expected-event activity, including the acknowledgement.
    expect(definition.stages).toHaveLength(scenario.activities.length)
    expect(definition.runStageCount).toBe(scenario.activities.length - 1)
    expect(definition.stages.map(stage => stage.index)).toEqual(scenario.activities.map((_, index) => index))
    expect(definition.stages.every(stage => stage.durationSeconds > 0)).toBe(true)
    expect(definition.totalRunSeconds).toBeGreaterThan(0)
    expect(hasStagedProcess(definition)).toBe(true)
  })

  it('places fault and recovery points at credible stages for the faulted scenarios', () => {
    for (const id of FAULT_SCENARIOS) {
      const definition = buildScenarioProcess(getScenario(id))
      expect(definition.faultStageIndex, id).not.toBeNull()
      expect(definition.recoveryStageIndex, id).not.toBeNull()
      expect(definition.faultType, id).toBe(getScenario(id).faultInjections![0])
      expect(definition.recoveryStageIndex!, id).toBeGreaterThan(definition.faultStageIndex!)
      expect(definition.stages[definition.recoveryStageIndex!]!.stageId, id).toContain('operator-acknowledged')
    }
  })

  it('uses the documented default duration only when a stage omits one', () => {
    expect(DEFAULT_STAGE_DURATION_SECONDS).toBeGreaterThan(0)
    const definition = buildScenarioProcess(getScenario('robot-axes'))
    expect(definition.stages.every(stage => stage.durationSeconds === DEFAULT_STAGE_DURATION_SECONDS)).toBe(true)
  })

  it('produces exactly the historical run/recovery program, plus explicit fault events', () => {
    for (const id of MATERIAL_FLOW_SCENARIOS) {
      const scenario = getScenario(id)
      const program = createScenarioEventProgram(scenario)
      const events = scenarioProcessEventSequence(buildScenarioProcess(scenario), { continuous: true })
      const nonFault = events.filter(event => event.type !== 'scenario.fault')
      expect(nonFault, id).toEqual(program.run)
      const faultEvents = events.filter(event => event.type === 'scenario.fault')
      expect(faultEvents.length, id).toBe(FAULT_SCENARIOS.includes(id as typeof FAULT_SCENARIOS[number]) ? 1 : 0)
    }
  })
})

describe('S67 scenario process simulation clock', () => {
  it('advances stages only when their declared duration has elapsed', () => {
    const definition = buildScenarioProcess(getScenario('sorting-normal-cycle'))
    const { driver, events } = collect(definition, { continuous: true })
    driver.start()

    driver.tick(0.5)
    expect(events).toHaveLength(0)
    driver.tick(0.3)
    expect(events.map(event => event.type)).toEqual(['scenario.stage'])
    expect(events[0]!.stage).toBe('vision-part-enters')
    expect(driver.snapshot().completedRunStages).toBe(1)
    expect(driver.snapshot().programProgress).toBeCloseTo(1 / definition.runStageCount, 5)

    // A large tick still emits every due stage in declared order.
    driver.tick(100)
    expect(events.map(event => event.type)).toEqual([
      'scenario.stage',
      'scenario.stage',
      'scenario.stage',
      'scenario.stage',
      'scenario.stage',
      'scenario.stage',
      'scenario.stage',
      'sorting.complete',
    ])
    expect(driver.snapshot().phase).toBe('awaiting-acknowledgement')
    expect(driver.snapshot().programProgress).toBe(1)

    driver.complete()
    expect(driver.snapshot().phase).toBe('completed')
  })

  it('honours pause and resume without losing deterministic position', () => {
    const definition = buildScenarioProcess(getScenario('palletizing-normal-cycle'))
    const { driver, events } = collect(definition, { continuous: true })
    driver.start()
    driver.tick(0.8)
    expect(events).toHaveLength(1)
    driver.pause()
    driver.tick(100)
    expect(events).toHaveLength(1)
    expect(driver.currentPhase).toBe('paused')
    driver.resume()
    driver.tick(100)
    expect(events.length).toBe(definition.runStageCount)
  })

  it('is deterministic and repeatable for identical inputs (replay compatible)', () => {
    const definition = buildScenarioProcess(getScenario('palletizing-vacuum-recovery'))
    const first = runScenarioProcess(getScenario('palletizing-vacuum-recovery'))
    const second = runScenarioProcess(getScenario('palletizing-vacuum-recovery'))
    expect(second.events).toEqual(first.events)
    expect(second.snapshot).toEqual(first.snapshot)
    expect(scenarioProcessEventSequence(definition)).toEqual(first.events)
  })
})

describe('S67 scenario process Step Mode', () => {
  it('exposes exactly one meaningful stage per step and pauses on the next', () => {
    const definition = buildScenarioProcess(getScenario('assembly-inspection-cycle'))
    const { driver, events } = collect(definition)
    driver.start()
    expect(driver.currentPhase).toBe('running')

    for (let index = 0; index < definition.runStageCount; index += 1) {
      const snapshot = driver.step()
      expect(events).toHaveLength(index + 1)
      const expectedStage = definition.stages[index]!
      if (expectedStage.event.type === 'scenario.stage') {
        expect(events[index]!.stage).toBe(expectedStage.stageId)
      } else {
        expect(events[index]!.type).toBe(expectedStage.event.type)
      }
      expect(snapshot.completedRunStages).toBe(index + 1)
      // Step mode does not wait out the stage duration.
      expect(driver.currentPhase === 'paused' || driver.currentPhase === 'awaiting-acknowledgement').toBe(true)
    }
    expect(driver.snapshot().phase).toBe('awaiting-acknowledgement')
    // Stepping past the run phase is a no-op.
    driver.step()
    expect(events).toHaveLength(definition.runStageCount)
  })
})

describe('S67 scenario process fault interruption and recovery', () => {
  it.each(FAULT_SCENARIOS)('pauses %s at its fault stage and resumes at the defined recovery point', (id) => {
    const definition = buildScenarioProcess(getScenario(id))
    const { driver, events } = collect(definition)
    driver.start()

    // Step up to and including the fault stage.
    for (let index = 0; index <= definition.faultStageIndex!; index += 1) driver.step()
    expect(driver.currentPhase).toBe('awaiting-recovery')
    expect(driver.snapshot().faulted).toBe(true)
    const emittedAtFault = events.length
    expect(events.filter(event => event.type === 'scenario.fault')).toHaveLength(1)

    // No further transition may fire while the fault is unacknowledged.
    driver.step()
    driver.tick(100)
    expect(events).toHaveLength(emittedAtFault)

    driver.acknowledgeFault()
    expect(driver.currentPhase).toBe('running')
    expect(driver.snapshot().stageId).toBe(definition.stages[definition.recoveryStageIndex!]!.stageId)

    // Resume through the remaining required transitions to the run-phase end.
    let guard = 0
    while (driver.currentPhase !== 'awaiting-acknowledgement' && guard < 64) {
      guard += 1
      driver.step()
    }
    expect(driver.snapshot().phase).toBe('awaiting-acknowledgement')
    expect(events.filter(event => event.type === 'scenario.fault')).toHaveLength(1)
  })

  it('auto-acknowledges a fault in continuous mode and never skips a transition', () => {
    const definition = buildScenarioProcess(getScenario('safety-door-recovery'))
    const { driver } = collect(definition, { continuous: true })
    const drained = driver.drainRunPhase()
    expect(driver.snapshot().phase).toBe('awaiting-acknowledgement')
    expect(driver.snapshot().faulted).toBe(false)
    expect(drained.filter(event => event.type === 'scenario.fault')).toHaveLength(1)
    // Every declared run stage was emitted exactly once.
    expect(drained.filter(event => event.type !== 'scenario.fault')).toHaveLength(definition.runStageCount)
  })
})
