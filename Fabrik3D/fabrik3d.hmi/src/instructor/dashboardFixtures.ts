import type {
  InstructorMetricsDto,
  TrainingActionDto,
  TrainingAssessmentDto,
  TrainingClassDto,
  TrainingResourceAssignmentDto,
  TrainingSessionDto,
} from '@fabrik3d/contracts'

/**
 * Deterministic in-memory fixtures for the instructor dashboard unit tests (S45). They mirror the
 * server DTO shapes and keep component tests independent of the network.
 */

export function makeClass(overrides: Partial<TrainingClassDto> = {}): TrainingClassDto {
  return {
    id: 'class-1',
    organizationId: 'org-1',
    name: 'Cohort A',
    description: 'Morning cohort',
    instructorSubjects: ['instructor-1'],
    learnerSubjects: ['learner-1', 'learner-2'],
    scheduleMetadata: {},
    createdAtUtc: '2026-09-01T08:00:00Z',
    updatedAtUtc: '2026-09-01T08:00:00Z',
    version: 0,
    ...overrides,
  }
}

export function makeAssignment(overrides: Partial<TrainingResourceAssignmentDto> = {}): TrainingResourceAssignmentDto {
  return {
    id: 'assignment-1',
    organizationId: 'org-1',
    classId: 'class-1',
    kind: 'Scenario',
    resourceId: 'pick-and-place',
    createdAtUtc: '2026-09-01T08:00:00Z',
    ...overrides,
  }
}

export function makeAction(overrides: Partial<TrainingActionDto> = {}): TrainingActionDto {
  // The generated S44 schema marks the typed sub-records as non-null objects, while the wire contract
  // genuinely omits them for actions that carry no hint/fault/recovery. The cast keeps the fixture
  // semantics accurate without loosening the shared contract type.
  return {
    id: 'action-1',
    actionId: 'a1',
    correlationId: null,
    role: 'observed',
    type: 'PICK_PART',
    target: null,
    expectedActionId: null,
    correctness: 'correct',
    severity: 'info',
    timestampUtc: '2026-09-20T10:00:00Z',
    sequence: 1,
    isFault: false,
    isHint: false,
    isRecovery: false,
    isSafetyViolation: false,
    hint: null,
    safetyViolation: null,
    recovery: null,
    schemaVersion: '1.0',
    recordedAtUtc: '2026-09-20T10:00:00Z',
    ...overrides,
  } as unknown as TrainingActionDto
}

export function makeAssessment(overrides: Partial<TrainingAssessmentDto> = {}): TrainingAssessmentDto {
  return {
    scoringRuleVersion: '1.0',
    assessmentSchemaVersion: '1.0',
    softwareVersion: '1.0.0',
    computedScore: 100,
    computedPossibleScore: 100,
    effectiveScore: 100,
    effectivePossibleScore: 100,
    complete: true,
    status: 'Computed',
    diagnostic: null,
    disclaimer: 'Educational training record; does not certify professional competence.',
    educationalScope: 'educational',
    criteria: [
      { id: 'completion', label: 'Completion', explanation: 'Scenario completed.', points: 40, earned: 40, passed: true, evidence: ['a1'] },
      { id: 'hint-discipline', label: 'Hint discipline', explanation: 'Hints within budget.', points: 15, earned: 10, passed: false, evidence: ['h1'] },
    ],
    assessmentVersion: 1,
    corrections: [],
    computedAtUtc: '2026-09-20T10:05:00Z',
    ...overrides,
  }
}

export function makeSession(overrides: Partial<TrainingSessionDto> = {}): TrainingSessionDto {
  return {
    id: 'session-1',
    organizationId: 'org-1',
    classId: 'class-1',
    learnerSubject: 'learner-1',
    alias: 'learner-one',
    scenarioId: 'pick-and-place',
    scenarioVersion: '1.0',
    simulationSessionId: null,
    simulatorId: 'sim-1',
    startedAtUtc: '2026-09-20T10:00:00Z',
    endedAtUtc: '2026-09-20T10:05:00Z',
    status: 'completed',
    completed: true,
    completionPercent: 100,
    expectedActions: ['PICK_PART', 'COMPLETE'],
    actionCount: 4,
    faultCount: 1,
    hintCount: 1,
    safetyViolationCount: 0,
    recoveryActionCount: 1,
    score: 100,
    possibleScore: 100,
    assessmentSchemaVersion: '1.0',
    scoringRuleVersion: '1.0',
    softwareVersion: '1.0.0',
    assessmentStatus: 'Computed',
    assessmentDiagnostic: null,
    assessment: makeAssessment(),
    audit: [{ action: 'completed', subject: 'learner-1', detail: null, atUtc: '2026-09-20T10:05:00Z' }],
    version: 2,
    ...overrides,
  }
}

export function makeMetrics(overrides: Partial<InstructorMetricsDto> = {}): InstructorMetricsDto {
  return {
    assessmentSchemaVersion: '1.0',
    definitionsVersion: '1.0',
    scoringRuleVersion: '1.0',
    generatedAtUtc: '2026-09-26T12:00:00Z',
    classId: 'class-1',
    scenarioId: 'pick-and-place',
    fromUtc: null,
    toUtc: null,
    sessionCount: 4,
    completedCount: 3,
    failedCount: 1,
    runningCount: 0,
    terminalCount: 4,
    completionRate: 0.75,
    meanSessionSeconds: 340,
    meanDiagnosisSeconds: 120,
    totalActions: 20,
    incorrectActionCount: 2,
    hintCount: 3,
    sessionsWithHints: 2,
    meanHintsPerSession: 0.75,
    faultCount: 2,
    recoveryActionCount: 2,
    safetyViolationCount: 1,
    sessionsWithSafetyViolations: 1,
    commonIncorrectActions: [{ key: 'WRONG_GRIP', count: 2 }],
    repeatedFaultTypes: [{ key: 'fault', count: 2 }],
    safetyMistakeRules: [{ key: 'guard-door-open', count: 1 }],
    truncated: false,
    educationalNote: 'Teaching aid from simulated evidence; not certification.',
    ...overrides,
  }
}
