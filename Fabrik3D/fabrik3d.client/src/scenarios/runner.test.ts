import { describe, expect, it } from 'vitest'
import { ScenarioRunner } from './runner'
import { SCENARIO_SCHEMA_VERSION, type ScenarioDefinition } from './types'

const L = { en: 'T', fr: 'T', de: 'T' }

const definition: ScenarioDefinition = {
  schemaVersion: SCENARIO_SCHEMA_VERSION,
  id: 'state-machine',
  title: L,
  level: 'beginner',
  learningObjectives: [L],
  prerequisites: [],
  activities: [
    { id: 'a', title: L, instruction: L, expectedEvent: { type: 'workflow.phase', match: { phase: 'PICK_PART' } } },
    { id: 'b', title: L, instruction: L, expectedEvent: { type: 'workflow.phase', match: { phase: 'MACHINING' } } },
    { id: 'c', title: L, instruction: L, expectedEvent: { type: 'workflow.palletComplete' } },
  ],
  successCriteria: [L],
  instructorNotes: L,
  explanation: L,
}

describe('ScenarioRunner state transitions', () => {
  it('starts in running with the first activity current', () => {
    const runner = new ScenarioRunner(definition)
    const state = runner.start()
    expect(state.status).toBe('running')
    expect(state.currentActivityId).toBe('a')
    expect(state.completedCount).toBe(0)
    expect(state.progressPercent).toBe(0)
  })

  it('advances exactly when the current activity matches an event', () => {
    const runner = new ScenarioRunner(definition)
    runner.start()

    // Non-matching event: no progress.
    let state = runner.observe({ type: 'workflow.phase', phase: 'SELECT_NEXT_SLOT' })
    expect(state.completedCount).toBe(0)
    expect(state.currentActivityId).toBe('a')

    // Matching event advances to the next activity.
    state = runner.observe({ type: 'workflow.phase', phase: 'PICK_PART' })
    expect(state.completedCount).toBe(1)
    expect(state.completedActivityIds).toEqual(['a'])
    expect(state.currentActivityId).toBe('b')
    expect(state.progressPercent).toBe(33)
  })

  it('completes after the last activity', () => {
    const runner = new ScenarioRunner(definition)
    runner.start()
    runner.observe({ type: 'workflow.phase', phase: 'PICK_PART' })
    runner.observe({ type: 'workflow.phase', phase: 'MACHINING' })
    const state = runner.observe({ type: 'workflow.palletComplete' })
    expect(state.status).toBe('completed')
    expect(state.completedCount).toBe(3)
    expect(state.progressPercent).toBe(100)
    expect(state.currentActivityId).toBeNull()
  })

  it('ignores events once completed and does not regress', () => {
    const runner = new ScenarioRunner(definition)
    runner.start()
    runner.observe({ type: 'workflow.phase', phase: 'PICK_PART' })
    runner.observe({ type: 'workflow.phase', phase: 'MACHINING' })
    const state = runner.observe({ type: 'workflow.palletComplete' })
    expect(runner.observe({ type: 'workflow.phase', phase: 'PICK_PART' }).status).toBe('completed')
    expect(runner.observe({ type: 'workflow.phase', phase: 'PICK_PART' }).completedCount).toBe(state.completedCount)
  })

  it('resets to idle', () => {
    const runner = new ScenarioRunner(definition)
    runner.start()
    const state = runner.reset()
    expect(state.status).toBe('idle')
    expect(state.completedCount).toBe(0)
    expect(state.currentActivityId).toBeNull()
  })
})