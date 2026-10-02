/**
 * S58 scenario runtime binding.
 *
 * Deterministic binding from a scenario definition to the ordered runtime events
 * an equipment host must observe. Events are derived from the scenario's
 * `expectedEvent` specs and are independent from render frame rate. The
 * `run`/`recovery` split preserves the existing material-flow UX (run the
 * process, then require an explicit acknowledgement) without caching any
 * per-scenario logic in a component.
 */

import { ScenarioRunner } from './runner'
import type { ScenarioDefinition, ScenarioEvent, ScenarioProgress } from './types'

export interface ScenarioEventProgram {
  /** Events applied when the operator starts the scenario. */
  run: ScenarioEvent[]
  /** Events applied when the operator acknowledges/recovery. */
  recovery: ScenarioEvent[]
}

/** The scenario's expected events in declared activity order. */
export function scenarioExpectedEventSequence(scenario: ScenarioDefinition): ScenarioEvent[] {
  return scenario.activities
    .map(activity => activity.expectedEvent)
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
    .map(spec => (spec.match ? { type: spec.type, ...spec.match } : { type: spec.type }))
}

/**
 * Splits the expected event sequence into the run phase (every activity except
 * the final acknowledgement) and the recovery phase (the final event). For the
 * built-in material-flow scenarios this is `[scenario.ready, <process>]` and
 * `[scenario.recovered]`, matching the historical host behaviour exactly.
 */
export function createScenarioEventProgram(scenario: ScenarioDefinition): ScenarioEventProgram {
  const events = scenarioExpectedEventSequence(scenario)
  if (events.length === 0) return { run: [], recovery: [] }
  return {
    run: events.slice(0, -1),
    recovery: events.slice(-1),
  }
}

/** Applies a single event to a runner and returns the resulting state. */
export function applyScenarioEvent(runner: ScenarioRunner, event: ScenarioEvent): ScenarioProgress {
  return runner.observe(event)
}

/** Creates a fresh deterministic runner for a scenario. */
export function createScenarioRunner(scenario: ScenarioDefinition): ScenarioRunner {
  return new ScenarioRunner(scenario)
}

/** Drives a fresh runner through the given events and returns the final state. */
export function runScenarioEvents(scenario: ScenarioDefinition, events: readonly ScenarioEvent[]): ScenarioProgress {
  const runner = createScenarioRunner(scenario)
  runner.start()
  for (const event of events) runner.observe(event)
  return runner.getState()
}

/** Runs the full `run` then `recovery` program to completion. */
export function runScenarioEventProgram(scenario: ScenarioDefinition, program = createScenarioEventProgram(scenario)): ScenarioProgress {
  return runScenarioEvents(scenario, [...program.run, ...program.recovery])
}

/** The idle progress a bound scenario reports before it starts. */
export function idleScenarioProgress(scenario: ScenarioDefinition | null, scenarioId: string): ScenarioProgress {
  return {
    scenarioId: scenario?.id ?? scenarioId,
    status: 'idle',
    currentActivityId: null,
    completedActivityIds: [],
    totalActivities: scenario?.activities.length ?? 0,
    completedCount: 0,
    progressPercent: 0,
  }
}
