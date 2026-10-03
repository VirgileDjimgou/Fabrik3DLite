/**
 * Versioned educational scenario format. Scenarios drive the simulator as
 * an ordered set of activities with expected events; orchestration is
 * separate from low-level robot and equipment behavior.
 */

export const SCENARIO_SCHEMA_VERSION = '1.0' as const

/** Learner/instructor text kept in the three supported languages. */
export interface LocalizedText {
  en: string
  fr: string
  de: string
}

export type ScenarioLevel = 'beginner' | 'intermediate' | 'advanced'

/** A single expected simulation event an activity waits for. */
export interface ScenarioEventSpec {
  type: string
  /** Optional literal fields that must match the observed event. */
  match?: Record<string, unknown>
}

export interface ScenarioActivity {
  id: string
  title: LocalizedText
  /** Learner-facing instruction shown before the expected event fires. */
  instruction: LocalizedText
  description?: LocalizedText
  /** When provided, the activity completes when this event is observed. */
  expectedEvent?: ScenarioEventSpec
  /**
   * S67: deterministic simulation-time duration of this process stage, in
   * seconds. Optional and additive; when absent a documented default applies.
   * Timing is consumed by the simulation clock (`ScenarioProcessDriver`), never
   * by render frames.
   */
  durationSeconds?: number
  /**
   * S67: stable machine id of an intermediate process stage. Used by the visual
   * reducer to bind visible state to the stage without depending on localized
   * text or the activity id.
   */
  stageId?: string
  /**
   * S67: this activity is the credible process stage where the scenario's
   * declared fault becomes active. The deterministic process pauses here in
   * guided/step mode until the operator acknowledges the fault.
   */
  faultPoint?: boolean
  /**
   * S67: this activity is the defined recovery point. After an acknowledgement
   * the deterministic process resumes here without skipping required process or
   * safety transitions.
   */
  recoveryPoint?: boolean
}

/** S67 intermediate process stage event; `stage` names the stage. */
export const SCENARIO_STAGE_EVENT = 'scenario.stage' as const

/** S67 fault-injection event raised at the declared fault stage. */
export const SCENARIO_FAULT_EVENT = 'scenario.fault' as const

export interface ScenarioDefinition {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION
  id: string
  title: LocalizedText
  level: ScenarioLevel
  learningObjectives: LocalizedText[]
  prerequisites: string[]
  /** Reference to a named cell template (or built-in id). */
  cellTemplateId?: string
  /** Robot joint configuration the scenario starts from. */
  initialJoints?: number[]
  /** Faults injected at scenario start; makes abnormal situations reproducible. */
  faultInjections?: import('../faults/types').FaultType[]
  /**
   * S38: versioned signal/equipment overlay injections. Optional and additive;
   * older scenario files without this field stay readable and valid.
   */
  faultOverlays?: ScenarioFaultOverlaySpec[]
  /** Ordered activities; the scenario completes when all finish. */
  activities: ScenarioActivity[]
  successCriteria: LocalizedText[]
  instructorNotes: LocalizedText
  /** Learner-facing explanation of the scenario. */
  explanation: LocalizedText
}

/** Versioned scenario overlay-injection schema (S38). */
export const SCENARIO_OVERLAY_SCHEMA_VERSION = '1.0' as const

export interface ScenarioFaultOverlaySpec {
  type: import('../faults/types').OverlayFaultType
  equipmentId: string
  signalIds?: string[]
  seed?: number
  magnitude?: number
  periodMs?: number
  delayMs?: number
}

export interface ScenarioFaultOverlayInjection {
  schemaVersion: typeof SCENARIO_OVERLAY_SCHEMA_VERSION
  overlays: ScenarioFaultOverlaySpec[]
}

/** A runtime observation from the simulator (e.g. a workflow event). */
export interface ScenarioEvent {
  type: string
  [key: string]: unknown
}

export type ScenarioStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface ScenarioProgress {
  scenarioId: string
  status: ScenarioStatus
  currentActivityId: string | null
  completedActivityIds: string[]
  totalActivities: number
  completedCount: number
  progressPercent: number
}
