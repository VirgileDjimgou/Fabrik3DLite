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

export type CreateJobRequest = components['schemas']['CreateJobRequest']
export type CreateTaskRequest = components['schemas']['CreateTaskRequest']
export type UpdateMachineStateRequest = components['schemas']['UpdateMachineStateRequest']
export type UpdateSimulationStateRequest = components['schemas']['UpdateSimulationStateRequest']
export type ClaimJobRequest = components['schemas']['ClaimJobRequest']
export type UpdateTaskStatusRequest = components['schemas']['UpdateTaskStatusRequest']
export type HeartbeatRequest = components['schemas']['HeartbeatRequest']
export type SaveCellTemplateRequest = components['schemas']['SaveCellTemplateRequest']

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
