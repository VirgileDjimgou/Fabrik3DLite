import type { components } from './orchestrator.generated'

export type { paths, components } from './orchestrator.generated'
export * from './signalr'

type CompletedResponse<T> = { [Key in keyof T]-?: T[Key] }

/**
 * Recursively removes optionality from a generated schema. Server DTO constructors always populate
 * every declared field, so the transport shape is complete even though OpenAPI marks reference
 * types nullable. Used for the nested robot-position payloads (S53).
 */
type DeepComplete<T> = T extends (infer U)[]
  ? DeepComplete<U>[]
  : T extends object
    ? { [Key in keyof T]-?: DeepComplete<T[Key]> }
    : T

// REST response types are complete because server DTO constructors populate every field.
export type JobDto = CompletedResponse<components['schemas']['JobDto']>
export type TaskDto = CompletedResponse<components['schemas']['TaskDto']>
export type SimulationSessionDto = CompletedResponse<components['schemas']['SimulationSessionDto']>
export type AlarmDto = CompletedResponse<components['schemas']['AlarmDto']>
export type OperatorMessageDto = CompletedResponse<components['schemas']['OperatorMessageDto']>
export type MachineStateDto = CompletedResponse<components['schemas']['MachineStateDto']>
export type ApiErrorDto = CompletedResponse<components['schemas']['ApiErrorDto']>
export type CellTemplateDto = CompletedResponse<components['schemas']['CellTemplateDto']>
export type ControlAuthorityDto = CompletedResponse<components['schemas']['ControlAuthorityDto']>
export type ControlAuthorityEventDto = CompletedResponse<components['schemas']['ControlAuthorityEventDto']>

export type CreateJobRequest = components['schemas']['CreateJobRequest']
export type CreateTaskRequest = components['schemas']['CreateTaskRequest']
export type UpdateMachineStateRequest = components['schemas']['UpdateMachineStateRequest']
export type UpdateSimulationStateRequest = components['schemas']['UpdateSimulationStateRequest']
export type ClaimJobRequest = components['schemas']['ClaimJobRequest']
export type UpdateTaskStatusRequest = components['schemas']['UpdateTaskStatusRequest']
export type HeartbeatRequest = components['schemas']['HeartbeatRequest']
export type StartJobDispatchRequest = components['schemas']['StartJobDispatchRequest']
export type DispatchAckRequest = components['schemas']['DispatchAckRequest']
export type SaveCellTemplateRequest = components['schemas']['SaveCellTemplateRequest']
export type AcquireControlAuthorityRequest = components['schemas']['AcquireControlAuthorityRequest']
export type TakeoverControlAuthorityRequest = components['schemas']['TakeoverControlAuthorityRequest']
export type ReleaseControlAuthorityRequest = components['schemas']['ReleaseControlAuthorityRequest']
export type HeartbeatControlAuthorityRequest = components['schemas']['HeartbeatControlAuthorityRequest']

// Training sessions and assessment (S44).
export type TrainingSessionDto = CompletedResponse<components['schemas']['TrainingSessionDto']>
export type TrainingActionDto = CompletedResponse<components['schemas']['TrainingActionDto']>
export type TrainingAssessmentDto = CompletedResponse<components['schemas']['TrainingAssessmentDto']>
export type TrainingReportDto = CompletedResponse<components['schemas']['TrainingReportDto']>
export type TrainingIngestionResultDto = CompletedResponse<components['schemas']['TrainingIngestionResultDto']>
export type StartTrainingSessionRequest = components['schemas']['StartTrainingSessionRequest']
export type ReportTrainingActionsRequest = components['schemas']['ReportTrainingActionsRequest']
export type CompleteTrainingSessionRequest = components['schemas']['CompleteTrainingSessionRequest']
export type CorrectAssessmentRequest = components['schemas']['CorrectAssessmentRequest']

// Deployment packaging and lifecycle (S48).
export type VersionDto = CompletedResponse<components['schemas']['VersionDto']>
export type HealthReportDto = CompletedResponse<components['schemas']['HealthReportDto']>
export type SupportBundleDto = CompletedResponse<components['schemas']['SupportBundleDto']>

// Instructor and class dashboard (S45).
export type InstructorMetricsDto = CompletedResponse<components['schemas']['InstructorMetricsDto']>
export type TrainingMetricCountDto = CompletedResponse<components['schemas']['TrainingMetricCountDto']>
export type TrainingClassDto = CompletedResponse<components['schemas']['TrainingClassDto']>
export type TrainingResourceAssignmentDto = CompletedResponse<components['schemas']['TrainingResourceAssignmentDto']>
export type RestartTrainingSessionResultDto = CompletedResponse<components['schemas']['RestartTrainingSessionResultDto']>
export type RestartTrainingSessionRequest = components['schemas']['RestartTrainingSessionRequest']
export type UpsertTrainingClassRequest = components['schemas']['UpsertTrainingClassRequest']
export type AssignTrainingResourceRequest = components['schemas']['AssignTrainingResourceRequest']

// The server always populates the full claim payload.
export type ClaimResultDto = {
  job: JobDto
  session: SimulationSessionDto
  tasks: TaskDto[]
}

// The server always populates the full dispatch payload (S51).
export type DispatchResultDto = {
  job: JobDto
  session: SimulationSessionDto
  tasks: TaskDto[]
  dispatchState: string
  targetCellId?: string | null
  assignedSimulatorId?: string | null
  dispatchCorrelationId?: string | null
  dispatchTimeoutAtUtc?: string | null
  failureReason?: string | null
}

// The server always populates the full composer read models (S52).
export type ComposerCellOptionDto = CompletedResponse<components['schemas']['ComposerCellOptionDto']>
export type ComposerScenarioOptionDto = CompletedResponse<components['schemas']['ComposerScenarioOptionDto']>
export type ComposerCellTemplateOptionDto = CompletedResponse<components['schemas']['ComposerCellTemplateOptionDto']>
export type JobComposerOptionsDto = CompletedResponse<components['schemas']['JobComposerOptionsDto']>
export type ComposerValidationIssueDto = CompletedResponse<components['schemas']['ComposerValidationIssueDto']>
export type GeneratedTaskPreviewDto = CompletedResponse<components['schemas']['GeneratedTaskPreviewDto']>
export type JobComposerPreviewDto = CompletedResponse<components['schemas']['JobComposerPreviewDto']>
export type PalletLayoutRequest = components['schemas']['PalletLayoutRequest']
export type PalletSlotRequest = components['schemas']['PalletSlotRequest']

// Authoritative robot positions and operator jog (S53).
export type RobotJointDto = DeepComplete<components['schemas']['RobotJointDto']>
export type RobotPoseDto = DeepComplete<components['schemas']['RobotPoseDto']>
export type RobotFramesDto = DeepComplete<components['schemas']['RobotFramesDto']>
export type RobotPositionsDto = DeepComplete<components['schemas']['RobotPositionsDto']>
export type PublishRobotPositionsRequest = DeepComplete<components['schemas']['PublishRobotPositionsRequest']>
export type JogCommandRequest = components['schemas']['JogCommandRequest']
export type JogCommandResultDto = CompletedResponse<components['schemas']['JogCommandResultDto']>
export type JogAuditDto = CompletedResponse<components['schemas']['JogAuditDto']>

export class OrchestratorApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, string[] | null>

  constructor(method: string, path: string, status: number, payload: unknown, fallbackText: string) {
    const error = asApiError(payload)
    super(`[${status}] ${method} ${path}: ${error?.message ?? fallbackText}`)
    this.name = 'OrchestratorApiError'
    this.code = error?.code ?? 'request_failed'
    this.status = status
    this.details = error?.details ?? undefined
  }
}

export function asApiError(value: unknown): ApiErrorDto | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ApiErrorDto>
  return typeof candidate.code === 'string' && typeof candidate.message === 'string' && typeof candidate.status === 'number'
    ? candidate as ApiErrorDto
    : null
}
