import type { components } from './orchestrator.generated'

export type { paths, components } from './orchestrator.generated'
export * from './signalr'

type CompletedResponse<T> = { [Key in keyof T]-?: T[Key] }

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
