import type {
  AssignTrainingResourceRequest,
  CompleteTrainingSessionRequest,
  InstructorMetricsDto,
  RestartTrainingSessionRequest,
  TrainingActionDto,
  TrainingAssessmentDto,
  TrainingClassDto,
  TrainingReportDto,
  TrainingResourceAssignmentDto,
  TrainingSessionDto,
  UpsertTrainingClassRequest,
} from '@fabrik3d/contracts'
import { getAccessToken, notifyUnauthorized } from '@/auth/authStore'

/**
 * Instructor dashboard REST client (S45).
 *
 * The dashboard is a read/compose surface over the S44 training APIs plus a small set of authorized,
 * audited instructor actions (assignment and restart). The server remains the single source of truth
 * and re-checks every role/tenant boundary; the client never computes a score or filters tenants.
 * A transport failure is surfaced as an explicit offline error so the UI can show an offline state
 * instead of stale, fabricated numbers.
 */

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

export class InstructorApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'InstructorApiError'
    this.status = status
  }

  /** True when the server could not be reached at all (network/offline), not a rejected request. */
  get offline(): boolean {
    return this.status === 0
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const bearer = getAccessToken()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new InstructorApiError(`Orchestrator unreachable: ${(error as Error).message}`, 0)
  }

  if (response.status === 401 && bearer) {
    notifyUnauthorized()
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new InstructorApiError(text || `[${response.status}] ${method} ${path}`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface SessionFilters {
  classId?: string
  learnerSubject?: string
  scenarioId?: string
  status?: string
  fromUtc?: string
  toUtc?: string
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

// ── Classes and assignments ──
export const getClasses = () => request<TrainingClassDto[]>('GET', '/organizations/classes')

export const getClassResources = (classId?: string) =>
  request<TrainingResourceAssignmentDto[]>(
    'GET', `/organizations/resources${queryString({ classId })}`)

export const assignResource = (body: AssignTrainingResourceRequest) =>
  request<TrainingResourceAssignmentDto>('POST', '/organizations/resources', body)

export const unassignResource = (id: string) =>
  request<void>('DELETE', `/organizations/resources/${encodeURIComponent(id)}`)

export const createClass = (body: UpsertTrainingClassRequest) =>
  request<TrainingClassDto>('POST', '/organizations/classes', body)

// ── Sessions ──
export const listSessions = (filters: SessionFilters = {}) =>
  request<TrainingSessionDto[]>(
    'GET',
    `/training/sessions${queryString({
      classId: filters.classId,
      learnerSubject: filters.learnerSubject,
      scenarioId: filters.scenarioId,
      status: filters.status,
      fromUtc: filters.fromUtc,
      toUtc: filters.toUtc,
      limit: 100,
    })}`)

export const getSession = (id: string) =>
  request<TrainingSessionDto>('GET', `/training/sessions/${encodeURIComponent(id)}`)

export const getSessionActions = (id: string) =>
  request<TrainingActionDto[]>('GET', `/training/sessions/${encodeURIComponent(id)}/actions`)

export const getSessionAssessment = (id: string) =>
  request<TrainingAssessmentDto | undefined>('GET', `/training/sessions/${encodeURIComponent(id)}/assessment`)

export const getSessionReport = (id: string) =>
  request<TrainingReportDto>('GET', `/training/sessions/${encodeURIComponent(id)}/report`)

export const completeSession = (id: string, body: CompleteTrainingSessionRequest) =>
  request<TrainingSessionDto>('POST', `/training/sessions/${encodeURIComponent(id)}/complete`, body)

/** Server restart result. The server always populates the returned session. */
export interface RestartSessionResult {
  session: TrainingSessionDto
  restartedFromSessionId: string
  reason: string | null
}

export const restartSession = (id: string, body: RestartTrainingSessionRequest) =>
  request<RestartSessionResult>(
    'POST', `/training/sessions/${encodeURIComponent(id)}/restart`, body)

// ── Aggregates ──
export const getMetrics = (filters: SessionFilters = {}) =>
  request<InstructorMetricsDto>(
    'GET',
    `/training/metrics${queryString({
      classId: filters.classId,
      scenarioId: filters.scenarioId,
      fromUtc: filters.fromUtc,
      toUtc: filters.toUtc,
    })}`)

export type {
  InstructorMetricsDto,
  TrainingActionDto,
  TrainingAssessmentDto,
  TrainingClassDto,
  TrainingReportDto,
  TrainingResourceAssignmentDto,
  TrainingSessionDto,
}
