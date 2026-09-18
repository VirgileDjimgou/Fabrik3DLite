/**
 * Deterministic scenario state machine. The runner advances through
 * ordered activities as expected events are observed.
 */

import type { ScenarioDefinition, ScenarioEvent, ScenarioEventSpec, ScenarioProgress, ScenarioStatus } from './types'

export class ScenarioRunner {
  private readonly definition: ScenarioDefinition
  private currentIndex = -1
  private status: ScenarioStatus = 'idle'
  private readonly completedIds: string[] = []

  constructor(definition: ScenarioDefinition) {
    this.definition = definition
  }

  get scenarioId(): string { return this.definition.id }

  start(): ScenarioProgress {
    if (this.definition.activities.length === 0) {
      this.status = 'completed'
      return this.getState()
    }
    this.currentIndex = 0
    this.status = 'running'
    return this.getState()
  }

  /**
   * Observe a simulation event. When it matches the current activity's
   * expected event, the activity completes and the runner advances.
   * Returns the resulting state (deterministic).
   */
  observe(event: ScenarioEvent): ScenarioProgress {
    if (this.status !== 'running') return this.getState()
    const activity = this.definition.activities[this.currentIndex]
    if (!activity || !activity.expectedEvent) return this.getState()
    if (!matches(activity.expectedEvent, event)) return this.getState()

    this.completedIds.push(activity.id)
    this.currentIndex += 1
    if (this.currentIndex >= this.definition.activities.length) this.status = 'completed'
    return this.getState()
  }

  reset(): ScenarioProgress {
    this.currentIndex = -1
    this.status = 'idle'
    this.completedIds.length = 0
    return this.getState()
  }

  getState(): ScenarioProgress {
    const total = this.definition.activities.length
    const completed = this.completedIds.length
    const current = this.currentIndex >= 0 ? this.definition.activities[this.currentIndex] : null
    return {
      scenarioId: this.definition.id,
      status: this.status,
      currentActivityId: current?.id ?? null,
      completedActivityIds: [...this.completedIds],
      totalActivities: total,
      completedCount: completed,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }
}

function matches(spec: ScenarioEventSpec, event: ScenarioEvent): boolean {
  if (spec.type !== event.type) return false
  if (!spec.match) return true
  return Object.entries(spec.match).every(([key, value]) => event[key] === value)
}