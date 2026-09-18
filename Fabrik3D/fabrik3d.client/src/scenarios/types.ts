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
}

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
  /** Ordered activities; the scenario completes when all finish. */
  activities: ScenarioActivity[]
  successCriteria: LocalizedText[]
  instructorNotes: LocalizedText
  /** Learner-facing explanation of the scenario. */
  explanation: LocalizedText
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
