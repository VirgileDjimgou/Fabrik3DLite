import { OrchestratorApiError } from '@fabrik3d/contracts'
import { getAccessToken, notifyUnauthorized } from '@/auth/authStore'
import type {
  AcquireControlAuthorityRequest,
  AlarmDto,
  ControlAuthorityDto,
  ControlAuthorityEventDto,
  CreateJobRequest,
  HeartbeatControlAuthorityRequest,
  JobDto,
  MachineStateDto,
  OperatorMessageDto,
  ReleaseControlAuthorityRequest,
  SimulationSessionDto,
  TakeoverControlAuthorityRequest,
  TaskDto,
} from '@fabrik3d/contracts'

export type {
  AcquireControlAuthorityRequest,
  AlarmDto,
  ControlAuthorityDto,
  ControlAuthorityEventDto,
  CreateJobRequest,
  HeartbeatControlAuthorityRequest,
  JobDto,
  MachineStateDto,
  OperatorMessageDto,
  ReleaseControlAuthorityRequest,
  SimulationSessionDto,
  TakeoverControlAuthorityRequest,
  TaskDto,
} from '@fabrik3d/contracts'

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const bearer = getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && bearer) {
    // Explicit re-auth instead of a silent anonymous retry.
    notifyUnauthorized()
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let payload: unknown
    try { payload = text ? JSON.parse(text) : undefined } catch { payload = undefined }
    throw new OrchestratorApiError(method, path, res.status, payload, text)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Jobs ──
export const getJobs = () => request<JobDto[]>('GET', '/jobs')
export const getJobById = (id: string) => request<JobDto>('GET', `/jobs/${id}`)
export const createJob = (req: CreateJobRequest) => request<JobDto>('POST', '/jobs', req)
export const deleteJob = (id: string) => request<void>('DELETE', `/jobs/${id}`)
export const startJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/start`)
export const pauseJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/pause`)
export const resumeJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/resume`)
export const stopJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/stop`)
export const getJobTasks = (id: string) => request<TaskDto[]>('GET', `/jobs/${id}/tasks`)

// ── Simulation sessions ──
export const getSessionById = (id: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/${id}`)
export const getSessionByJob = (jobId: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/by-job/${jobId}`)

// ── Machine state ──
export const getCurrentMachineState = () =>
  request<MachineStateDto | undefined>('GET', '/machine-state/current')

// ── Alarms ──
export const getAlarms = (limit = 100) => request<AlarmDto[]>('GET', `/alarms?limit=${limit}`)
export const getActiveAlarms = () => request<AlarmDto[]>('GET', '/alarms/active')
export const acknowledgeAlarm = (id: string, by = 'operator') =>
  request<AlarmDto>('POST', `/alarms/${id}/acknowledge?by=${by}`)
export const transitionAlarm = (id: string, state: string, by = 'operator') =>
  request<AlarmDto>('POST', `/alarms/${id}/transition?state=${encodeURIComponent(state)}&by=${encodeURIComponent(by)}`)

// ── Messages ──
export const getMessages = (limit = 100) =>
  request<OperatorMessageDto[]>('GET', `/messages?limit=${limit}`)

// ── Control authority (S36) ──
export const getControlAuthority = (scope: string) =>
  request<ControlAuthorityDto>('GET', `/control-authority/${encodeURIComponent(scope)}`)
export const acquireControlAuthority = (scope: string, req: AcquireControlAuthorityRequest) =>
  request<ControlAuthorityDto>('POST', `/control-authority/${encodeURIComponent(scope)}/acquire`, req)
export const releaseControlAuthority = (scope: string, req: ReleaseControlAuthorityRequest) =>
  request<ControlAuthorityDto>('POST', `/control-authority/${encodeURIComponent(scope)}/release`, req)
export const takeoverControlAuthority = (scope: string, req: TakeoverControlAuthorityRequest) =>
  request<ControlAuthorityDto>('POST', `/control-authority/${encodeURIComponent(scope)}/takeover`, req)
export const heartbeatControlAuthority = (scope: string, req: HeartbeatControlAuthorityRequest) =>
  request<ControlAuthorityDto>('POST', `/control-authority/${encodeURIComponent(scope)}/heartbeat`, req)
export const getControlAuthorityAudit = (scope: string, limit = 50) =>
  request<ControlAuthorityEventDto[]>(
    'GET', `/control-authority/${encodeURIComponent(scope)}/audit?limit=${limit}`)

// ── Health ──
export const getHealth = () =>
  request<{ status: string; timestamp: string; version: string }>('GET', '/health')
