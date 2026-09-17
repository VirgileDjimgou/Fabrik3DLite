/**
 * Lightweight REST client for the Fabrik3D orchestration backend.
 *
 * Uses native fetch — no heavy networking framework required.
 * Base URL defaults to the Vite proxy (/api) so requests go through
 * the dev-server proxy in development. Set VITE_ORCHESTRATOR_URL to
 * target a specific backend directly.
 *
 * Every mutating call carries a correlation id (X-Correlation-Id) so
 * commands, server logs and hub events can be traced end to end.
 */

import { OrchestratorApiError } from '@fabrik3d/contracts'
import type {
  ClaimJobRequest,
  ClaimResultDto,
  CreateJobRequest,
  CreateTaskRequest,
  HeartbeatRequest,
  JobDto,
  MachineStateDto,
  SimulationSessionDto,
  TaskDto,
  UpdateMachineStateRequest,
  UpdateSimulationStateRequest,
  UpdateTaskStatusRequest,
} from '@fabrik3d/contracts'

export type {
  ClaimJobRequest,
  ClaimResultDto,
  CreateJobRequest,
  CreateTaskRequest,
  HeartbeatRequest,
  JobDto,
  MachineStateDto,
  SimulationSessionDto,
  TaskDto,
  UpdateMachineStateRequest,
  UpdateSimulationStateRequest,
  UpdateTaskStatusRequest,
} from '@fabrik3d/contracts'

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined

/** Resolved base for all REST calls (empty string = same origin / proxy). */
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

/** Stable simulator identity for this browser session (ownership checks). */
export const SIMULATOR_ID =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `simulator-${Date.now()}-${Math.random().toString(16).slice(2)}`

/** Generates a correlation id for a command. */
export const newCorrelationId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`

if (import.meta.env.DEV) {
  console.log(`[API] base → ${BASE}`)
}

async function request<T>(method: string, path: string, body?: unknown, correlationId?: string): Promise<T> {
  const corr = correlationId ?? newCorrelationId()
  if (import.meta.env.DEV && method !== 'GET') {
    console.log(`[Simulator][REST] ${method} ${path} corr=${corr}`, body ?? '')
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Correlation-Id': corr,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let payload: unknown
    try { payload = text ? JSON.parse(text) : undefined } catch { payload = undefined }
    throw new OrchestratorApiError(method, path, res.status, payload, text)
  }
  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Jobs ───────────────────────────────────────────────────────────

export const getJobs = () => request<JobDto[]>('GET', '/jobs')

export const getJobById = (id: string) => request<JobDto>('GET', `/jobs/${id}`)

export const createJob = (req: CreateJobRequest) => request<JobDto>('POST', '/jobs', req)

export const deleteJob = (id: string) => request<void>('DELETE', `/jobs/${id}`)

export const startJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/start`)

export const pauseJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/pause`)

export const resumeJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/resume`)

export const stopJob = (id: string) => request<JobDto>('POST', `/jobs/${id}/stop`)

export const getJobTasks = (id: string) => request<TaskDto[]>('GET', `/jobs/${id}/tasks`)

/** Claim an existing runnable job and its simulation session for this simulator. */
export const claimJob = (id: string, req: ClaimJobRequest) =>
  request<ClaimResultDto>('POST', `/jobs/${id}/claim`, req, req.correlationId ?? undefined)

// ── Simulation sessions ────────────────────────────────────────────

export const getSessionById = (id: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/${id}`)

export const getSessionByJob = (jobId: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/by-job/${jobId}`)

export const updateSimulationSessionState = (id: string, payload: UpdateSimulationStateRequest) =>
  request<SimulationSessionDto>('PUT', `/simulation-sessions/${id}/state`, payload)

export const heartbeatSimulationSession = (id: string, simulatorId: string) =>
  request<SimulationSessionDto>(
    'POST', `/simulation-sessions/${id}/heartbeat`,
    { simulatorId } satisfies HeartbeatRequest)

// ── Tasks ──────────────────────────────────────────────────────────

export const updateTaskStatus = (taskId: string, payload: UpdateTaskStatusRequest) =>
  request<TaskDto>('PUT', `/tasks/${taskId}/status`, payload)

// ── Machine state ──────────────────────────────────────────────────

export const getCurrentMachineState = () =>
  request<MachineStateDto | undefined>('GET', '/machine-state/current')

export const updateCurrentMachineState = (payload: UpdateMachineStateRequest) =>
  request<MachineStateDto>('PUT', '/machine-state/current', payload)
