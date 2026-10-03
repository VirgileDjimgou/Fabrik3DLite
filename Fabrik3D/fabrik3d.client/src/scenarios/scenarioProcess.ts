/**
 * S67 deterministic scenario process scheduler.
 *
 * Deepens the existing material-flow scenarios into inspectable, temporally
 * credible stages without a second timeline engine. The process is pure data
 * derived from `ScenarioDefinition.activities`: every activity becomes an
 * ordered stage with a deterministic simulation-time duration, an expected
 * event and optional fault/recovery markers.
 *
 * `ScenarioProcessDriver` advances those stages on an injectable simulation
 * clock. It never reads render frames and it holds no Three.js objects, robot
 * controller or telemetry: it only decides *when* the already-authoritative
 * scenario events fire, so the `ScenarioRunner` and `CellVisualState` stay the
 * single source of truth. Continuous mode fast-forwards the run phase (the
 * existing operator Run behaviour); guided/step mode pauses at each stage and
 * at a declared fault stage until the operator acknowledges it.
 */

import type { ScenarioActivity, ScenarioDefinition, ScenarioEvent } from './types'
import { SCENARIO_FAULT_EVENT, SCENARIO_STAGE_EVENT } from './types'

export const SCENARIO_PROCESS_SCHEMA_VERSION = '1.0' as const

/** Default simulation-time duration of a stage that does not declare one. */
export const DEFAULT_STAGE_DURATION_SECONDS = 0.6

/** One ordered, timed process stage derived from a scenario activity. */
export interface ScenarioProcessStage {
  index: number
  activityId: string
  stageId: string
  event: ScenarioEvent
  durationSeconds: number
  faultPoint: boolean
  recoveryPoint: boolean
}

export interface ScenarioProcessDefinition {
  schemaVersion: typeof SCENARIO_PROCESS_SCHEMA_VERSION
  scenarioId: string
  stages: ScenarioProcessStage[]
  /**
   * Number of stages that belong to the run phase. The final expected-event
   * activity is the explicit acknowledgement consumed by `recover()`, matching
   * the historical `run`/`recovery` split.
   */
  runStageCount: number
  faultStageIndex: number | null
  recoveryStageIndex: number | null
  /** First declared fault the scenario carries, used as the fault event reason. */
  faultType: string | null
  /** Sum of the declared run-phase durations, in seconds. */
  totalRunSeconds: number
}

/** Builds the deterministic process definition for a scenario. */
export function buildScenarioProcess(scenario: ScenarioDefinition): ScenarioProcessDefinition {
  const stages: ScenarioProcessStage[] = []
  for (const activity of scenario.activities) {
    if (!activity.expectedEvent || !activity.expectedEvent.type) continue
    stages.push(stageFromActivity(activity, stages.length))
  }
  const runStageCount = Math.max(0, stages.length - 1)
  const faultStageIndex = stages.findIndex(stage => stage.faultPoint)
  const recoveryStageIndex = stages.findIndex(stage => stage.recoveryPoint)
  const totalRunSeconds = stages
    .slice(0, runStageCount)
    .reduce((sum, stage) => sum + stage.durationSeconds, 0)
  return {
    schemaVersion: SCENARIO_PROCESS_SCHEMA_VERSION,
    scenarioId: scenario.id,
    stages,
    runStageCount,
    faultStageIndex: faultStageIndex >= 0 ? faultStageIndex : null,
    recoveryStageIndex: recoveryStageIndex >= 0 ? recoveryStageIndex : null,
    faultType: scenario.faultInjections?.[0] ?? null,
    totalRunSeconds,
  }
}

function stageFromActivity(activity: ScenarioActivity, index: number): ScenarioProcessStage {
  const spec = activity.expectedEvent!
  const event: ScenarioEvent = spec.match ? { type: spec.type, ...spec.match } : { type: spec.type }
  const declared = activity.durationSeconds
  const durationSeconds = typeof declared === 'number' && Number.isFinite(declared)
    ? Math.max(0, declared)
    : DEFAULT_STAGE_DURATION_SECONDS
  return {
    index,
    activityId: activity.id,
    stageId: activity.stageId ?? activity.id,
    event,
    durationSeconds,
    faultPoint: Boolean(activity.faultPoint),
    recoveryPoint: Boolean(activity.recoveryPoint),
  }
}

export type ScenarioProcessPhase =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaiting-recovery'
  | 'awaiting-acknowledgement'
  | 'completed'

export interface ScenarioProcessSnapshot {
  schemaVersion: typeof SCENARIO_PROCESS_SCHEMA_VERSION
  scenarioId: string
  phase: ScenarioProcessPhase
  /** Index of the stage currently in progress, or the next stage to emit. */
  stageIndex: number
  /** Stage id of the stage currently in progress, if any. */
  stageId: string | null
  completedStageIds: string[]
  runStageCount: number
  completedRunStages: number
  elapsedSeconds: number
  runElapsedSeconds: number
  totalRunSeconds: number
  programProgress: number
  faulted: boolean
  faultType: string | null
  /** Stage id the process will resume from after an acknowledgement. */
  recoveryStageId: string | null
}

export interface ScenarioProcessDriverOptions {
  /**
   * Continuous mode auto-acknowledges a fault stage and keeps running; guided
   * mode pauses at the fault until `acknowledgeFault()` and at each stage in
   * step mode. Defaults to `false` (guided).
   */
  continuous?: boolean
  /** Receives every authoritative event the scheduler emits, in order. */
  onEvent?: (event: ScenarioEvent) => void
}

/**
 * Advances a `ScenarioProcessDefinition` on a deterministic simulation clock.
 * It is a scheduler only: it does not own scenario state, robot motion or
 * visible state, and it never reads back from them.
 */
export class ScenarioProcessDriver {
  readonly definition: ScenarioProcessDefinition

  private readonly continuous: boolean
  private onEvent: ((event: ScenarioEvent) => void) | undefined

  private phase: ScenarioProcessPhase = 'idle'
  private stageIndex = 0
  private elapsedInStage = 0
  private elapsedSeconds = 0
  private runElapsedSeconds = 0
  private readonly completedStageIds: string[] = []
  private faulted = false

  constructor(definition: ScenarioProcessDefinition, options: ScenarioProcessDriverOptions = {}) {
    this.definition = definition
    this.continuous = options.continuous ?? false
    this.onEvent = options.onEvent
  }

  get currentPhase(): ScenarioProcessPhase { return this.phase }

  start(): ScenarioProcessSnapshot {
    this.phase = 'running'
    this.stageIndex = 0
    this.elapsedInStage = 0
    this.elapsedSeconds = 0
    this.runElapsedSeconds = 0
    this.completedStageIds.length = 0
    this.faulted = false
    return this.snapshot()
  }

  reset(): ScenarioProcessSnapshot {
    this.phase = 'idle'
    this.stageIndex = 0
    this.elapsedInStage = 0
    this.elapsedSeconds = 0
    this.runElapsedSeconds = 0
    this.completedStageIds.length = 0
    this.faulted = false
    return this.snapshot()
  }

  /** Advances the deterministic clock and emits every stage that becomes due. */
  tick(deltaSeconds: number): ScenarioProcessSnapshot {
    if (this.phase !== 'running') return this.snapshot()
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
    this.elapsedSeconds += dt
    this.elapsedInStage += dt
    this.advanceDueStages()
    return this.snapshot()
  }

  /**
   * Step Mode: completes exactly one stage immediately (its declared duration
   * is not waited out, but the same ordered event fires) and leaves the process
   * paused on the next stage. Fault/acknowledgement phases are still respected.
   */
  step(): ScenarioProcessSnapshot {
    if (this.phase === 'idle') this.start()
    if (this.phase !== 'running' && this.phase !== 'paused') return this.snapshot()
    this.phase = 'running'
    this.elapsedInStage = 0
    const canContinue = this.completeRunStage()
    // Step Mode always rests on the next stage: the caller inspects it and
    // issues the following step explicitly.
    if (canContinue) this.phase = 'paused'
    return this.snapshot()
  }

  pause(): ScenarioProcessSnapshot {
    if (this.phase === 'running') this.phase = 'paused'
    return this.snapshot()
  }

  resume(): ScenarioProcessSnapshot {
    if (this.phase === 'paused') this.phase = 'running'
    return this.snapshot()
  }

  /**
   * Clears an active fault and resumes at the defined recovery point. Required
   * process/safety transitions after the recovery point are never skipped.
   */
  acknowledgeFault(): ScenarioProcessSnapshot {
    if (this.phase !== 'awaiting-recovery') return this.snapshot()
    this.faulted = false
    const recovery = this.definition.recoveryStageIndex
    if (recovery !== null && recovery > this.stageIndex) this.stageIndex = recovery
    this.elapsedInStage = 0
    this.phase = 'running'
    return this.snapshot()
  }

  /** Marks the run phase complete once the explicit acknowledgement is observed. */
  complete(): ScenarioProcessSnapshot {
    if (this.phase !== 'completed') {
      this.phase = 'completed'
      this.faulted = false
    }
    return this.snapshot()
  }

  /**
   * Fast-forwards the whole run phase in continuous mode and returns the exact
   * ordered events it emitted. Used by the continuous operator Run path; it is
   * still a bounded deterministic scheduling step, not a render-frame loop.
   */
  drainRunPhase(): ScenarioEvent[] {
    const events: ScenarioEvent[] = []
    const previous = this.onEvent
    this.onEvent = (event) => { events.push(event) }
    try {
      if (this.phase === 'idle') this.start()
      let guard = 0
      while (this.phase === 'running' && guard < 10_000) {
        guard += 1
        const stage = this.definition.stages[this.stageIndex]
        const remaining = stage ? Math.max(0, stage.durationSeconds - this.elapsedInStage) : 0
        this.tick(remaining)
        // Guard against a zero-duration stage that a floating point tick fails
        // to cross: force-complete it, still in deterministic order.
        if (this.phase === 'running' && this.definition.stages[this.stageIndex] === stage) {
          this.elapsedInStage = 0
          this.completeRunStage()
        }
      }
    } finally {
      this.onEvent = previous
    }
    return events
  }

  snapshot(): ScenarioProcessSnapshot {
    const stage = this.definition.stages[this.stageIndex]
    const completedRunStages = this.completedStageIds.filter(id =>
      this.definition.stages.slice(0, this.definition.runStageCount).some(s => s.activityId === id),
    ).length
    const recoveryStage = this.definition.recoveryStageIndex !== null
      ? this.definition.stages[this.definition.recoveryStageIndex]?.stageId ?? null
      : null
    return {
      schemaVersion: SCENARIO_PROCESS_SCHEMA_VERSION,
      scenarioId: this.definition.scenarioId,
      phase: this.phase,
      stageIndex: this.stageIndex,
      stageId: stage ? stage.stageId : null,
      completedStageIds: [...this.completedStageIds],
      runStageCount: this.definition.runStageCount,
      completedRunStages,
      elapsedSeconds: this.elapsedSeconds,
      runElapsedSeconds: this.runElapsedSeconds,
      totalRunSeconds: this.definition.totalRunSeconds,
      programProgress: this.definition.runStageCount > 0
        ? Math.min(1, completedRunStages / this.definition.runStageCount)
        : 0,
      faulted: this.faulted,
      faultType: this.definition.faultType,
      recoveryStageId: recoveryStage,
    }
  }

  private advanceDueStages(): void {
    let guard = 0
    while (this.phase === 'running' && guard < 10_000) {
      guard += 1
      const stage = this.definition.stages[this.stageIndex]
      if (!stage) {
        this.phase = 'awaiting-acknowledgement'
        return
      }
      if (this.elapsedInStage + 1e-9 < stage.durationSeconds) return
      this.elapsedInStage = Math.max(0, this.elapsedInStage - stage.durationSeconds)
      this.completeRunStage()
    }
  }

  /**
   * Emits the stage currently in progress and advances. Returns true while the
   * run phase can continue; false once a fault pause or the run-phase end is
   * reached.
   */
  private completeRunStage(): boolean {
    const stage = this.definition.stages[this.stageIndex]
    if (!stage || this.stageIndex >= this.definition.runStageCount) {
      this.phase = 'awaiting-acknowledgement'
      return false
    }
    this.onEvent?.(stage.event)
    this.completedStageIds.push(stage.activityId)
    this.runElapsedSeconds += stage.durationSeconds
    this.stageIndex += 1

    if (stage.faultPoint) {
      this.faulted = true
      this.onEvent?.({ type: SCENARIO_FAULT_EVENT, ...(this.definition.faultType ? { fault: this.definition.faultType } : {}) })
      if (!this.continuous) {
        this.phase = 'awaiting-recovery'
        return false
      }
      // Continuous mode: the Run command itself is the acknowledgement, so the
      // defined recovery transitions proceed deterministically from here.
      this.faulted = false
      const recovery = this.definition.recoveryStageIndex
      if (recovery !== null && recovery > this.stageIndex) this.stageIndex = recovery
    }

    if (this.stageIndex >= this.definition.runStageCount) {
      this.phase = 'awaiting-acknowledgement'
      return false
    }
    return true
  }
}

/** Deterministic ordered stage-event sequence for a scenario process. */
export function scenarioProcessEventSequence(
  definition: ScenarioProcessDefinition,
  options: { continuous?: boolean } = {},
): ScenarioEvent[] {
  const driver = new ScenarioProcessDriver(definition, { continuous: options.continuous ?? true })
  return driver.drainRunPhase()
}

/** Convenience: build and drain a scenario process in one deterministic call. */
export function runScenarioProcess(
  scenario: ScenarioDefinition,
  options: { continuous?: boolean } = {},
): { definition: ScenarioProcessDefinition; events: ScenarioEvent[]; snapshot: ScenarioProcessSnapshot } {
  const definition = buildScenarioProcess(scenario)
  const driver = new ScenarioProcessDriver(definition, { continuous: options.continuous ?? true })
  const events = driver.drainRunPhase()
  return { definition, events, snapshot: driver.snapshot() }
}

/** True when a scenario has the S67 staged timing metadata. */
export function hasStagedProcess(definition: ScenarioProcessDefinition): boolean {
  return definition.stages.length > 1 && definition.stages.some(stage => stage.stageId !== stage.activityId)
}
