/**
 * S71 deterministic execution-stage capture planning.
 *
 * The Revision 4 validation must capture *execution*, not only idle cells, for
 * every flagship scenario. This module is a pure, renderer-free helper that
 * turns a scenario's declared `ScenarioProcessDefinition` into an ordered list
 * of capture targets and the exact number of guided process steps needed to
 * reach each one.
 *
 * It introduces no new timeline engine: it only reads the S67 process
 * definition and reuses the existing `ScenarioProcessDriver` step semantics
 * (`step()` completes exactly one declared stage). The host drives the real
 * process with these steps; the helper itself never touches Three.js, the
 * runner or telemetry.
 */

import type { ScenarioProcessDefinition } from './scenarioProcess'

export const SCENARIO_STAGE_CAPTURE_SCHEMA_VERSION = '1.0' as const

/** One deterministic capture target: a declared process stage. */
export interface ScenarioStageCaptureTarget {
  /** Stable machine id of the stage (`ScenarioProcessStage.stageId`). */
  stageId: string
  /** Zero-based index of the stage in the declared process order. */
  index: number
  /** Activity id the stage was derived from. */
  activityId: string
  /** Number of guided `step()` calls needed to reach this stage. */
  steps: number
  /** True when this stage is the scenario's declared fault point. */
  faultPoint: boolean
  /** True when this stage is the scenario's declared recovery point. */
  recoveryPoint: boolean
}

export interface ScenarioStageCapturePlan {
  schemaVersion: typeof SCENARIO_STAGE_CAPTURE_SCHEMA_VERSION
  scenarioId: string
  /** Ordered capture targets, one per declared process stage. */
  targets: ScenarioStageCaptureTarget[]
  /** Total number of declared process stages. */
  stageCount: number
}

/**
 * Builds the ordered capture plan for a scenario process. Every declared stage
 * becomes a target; `steps` is the number of guided steps required to reach it
 * from a freshly started guided process.
 *
 * The S67 driver's `step()` completes the stage currently in progress and rests
 * on the next one, so reaching stage `i` requires `i + 1` steps. A fault stage
 * pauses the process in guided mode; the plan records that so a capture can
 * acknowledge the fault before continuing.
 */
export function buildScenarioStageCapturePlan(
  definition: ScenarioProcessDefinition,
): ScenarioStageCapturePlan {
  const targets: ScenarioStageCaptureTarget[] = definition.stages.map((stage, index) => ({
    stageId: stage.stageId,
    index,
    activityId: stage.activityId,
    steps: index + 1,
    faultPoint: stage.faultPoint,
    recoveryPoint: stage.recoveryPoint,
  }))
  return {
    schemaVersion: SCENARIO_STAGE_CAPTURE_SCHEMA_VERSION,
    scenarioId: definition.scenarioId,
    targets,
    stageCount: definition.stages.length,
  }
}

/**
 * Resolves one capture target by its stable stage id. Returns `null` for an
 * unknown id so a caller can fail closed instead of capturing an arbitrary
 * frame.
 */
export function resolveStageCaptureTarget(
  plan: ScenarioStageCapturePlan,
  stageId: string,
): ScenarioStageCaptureTarget | null {
  return plan.targets.find(target => target.stageId === stageId) ?? null
}

/**
 * The ordered stage ids a capture run must visit to show the whole declared
 * process. Fault and recovery stages are included because they are part of the
 * declared execution, not an error path.
 */
export function stageCaptureSequence(plan: ScenarioStageCapturePlan): string[] {
  return plan.targets.map(target => target.stageId)
}
