import { describe, expect, it } from 'vitest'
import { getScenario } from './catalog'
import {
  applyScenarioProgress,
  createCellVisualState,
  hasVisibleFault,
  isRecovered,
  reduceCellVisualState,
  type CellVisualState,
} from './cellVisualState'
import { createScenarioEventProgram } from './runtimeBinding'
import type { ScenarioEvent, ScenarioProgress } from './types'

function drive(scenarioId: string): { state: CellVisualState; running: CellVisualState; completed: CellVisualState } {
  const scenario = getScenario(scenarioId)
  const program = createScenarioEventProgram(scenario)
  const runningProgress: ScenarioProgress = { scenarioId, status: 'running', currentActivityId: 'recovery', completedActivityIds: ['prerequisites', 'cycle'], totalActivities: 3, completedCount: 2, progressPercent: 67 }
  const completedProgress: ScenarioProgress = { scenarioId, status: 'completed', currentActivityId: null, completedActivityIds: ['prerequisites', 'cycle', 'recovery'], totalActivities: 3, completedCount: 3, progressPercent: 100 }
  const initial = applyScenarioProgress(createCellVisualState(scenarioId), { scenarioId, status: 'idle', currentActivityId: 'prerequisites', completedActivityIds: [], totalActivities: 3, completedCount: 0, progressPercent: 0 })
  let running = initial
  for (const event of program.run) running = applyScenarioProgress(reduceCellVisualState(running, event), runningProgress)
  let completed = running
  for (const event of program.recovery) completed = applyScenarioProgress(reduceCellVisualState(completed, event), completedProgress)
  return { state: initial, running, completed }
}

describe('S59 scenario cell visual state binding', () => {
  it('binds the vision sorting normal cycle to its authoritative run event', () => {
    const { state, running, completed } = drive('sorting-normal-cycle')
    expect(state.partStage).toBe('idle')
    expect(state.jam).toBe(false)
    expect(running.partStage).toBe('diverted')
    expect(running.classification).toBe('accepted')
    expect(running.acceptedParts).toBe(1)
    expect(running.inspectionActive).toBe(true)
    expect(completed.lifecycle).toBe('completed')
    expect(completed.recovered).toBe(true)
    expect(isRecovered(completed)).toBe(true)
  })

  it('starts a jam scenario with a visible fault and clears it only on recovery', () => {
    const { state, running } = drive('sorting-jam-recovery')
    expect(state.jam).toBe(true)
    expect(state.partStage).toBe('jammed')
    expect(hasVisibleFault(state)).toBe(true)
    expect(running.jam).toBe(false)
    expect(running.classification).toBe('rejected')
    expect(running.rejectedParts).toBe(1)
    expect(running.recovered).toBe(true)
    expect(running.stackLight).toBe('green')
  })

  it('shows palletizing layer progression and clears vacuum loss on recovery', () => {
    const normal = drive('palletizing-normal-cycle')
    expect(normal.state.layerPlaced).toBe(0)
    expect(normal.running.palletComplete).toBe(true)
    expect(normal.running.layerPlaced).toBe(1)

    const vacuum = drive('palletizing-vacuum-recovery')
    expect(vacuum.state.vacuumLoss).toBe(true)
    expect(hasVisibleFault(vacuum.state)).toBe(true)
    expect(vacuum.running.vacuumLoss).toBe(false)
    expect(vacuum.running.recovered).toBe(true)
    expect(hasVisibleFault(vacuum.running)).toBe(false)
  })

  it('binds the assembly part presence and clamp state', () => {
    const { running } = drive('assembly-inspection-cycle')
    expect(running.partPresent).toBe(true)
    expect(running.clamped).toBe(false)
    expect(running.reworkRequired).toBe(false)
  })

  it('makes gate, scanner and E-stop state changes visible for safety training', () => {
    const { state, running, completed } = drive('safety-door-recovery')
    expect(state.gateOpen).toBe(true)
    expect(state.scannerMuted).toBe(true)
    expect(state.emergencyStop).toBe(true)
    expect(state.stackLight).toBe('red')
    expect(hasVisibleFault(state)).toBe(true)

    expect(running.gateOpen).toBe(false)
    expect(running.scannerMuted).toBe(false)
    expect(running.emergencyStop).toBe(false)
    expect(running.stackLight).toBe('green')
    expect(hasVisibleFault(running)).toBe(false)
    expect(completed.lifecycle).toBe('completed')
  })

  it('maps lifecycle from authoritative scenario progress and ignores unknown events', () => {
    const running = applyScenarioProgress(createCellVisualState('palletizing-normal-cycle'), {
      scenarioId: 'palletizing-normal-cycle', status: 'running', currentActivityId: 'cycle', completedActivityIds: ['prerequisites'], totalActivities: 3, completedCount: 1, progressPercent: 33,
    })
    expect(running.lifecycle).toBe('running')
    expect(running.programProgress).toBeCloseTo(0.33, 5)

    const unknown: ScenarioEvent = { type: 'not.a.real.event' }
    expect(reduceCellVisualState(running, unknown)).toEqual(running)
  })
})
