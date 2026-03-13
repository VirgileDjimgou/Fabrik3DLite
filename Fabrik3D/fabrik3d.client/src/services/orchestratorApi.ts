/**
 * Lightweight REST client for the Fabrik3D orchestration backend.
 *
 * Uses native fetch — no heavy networking framework required.
 * Base URL defaults to the Vite proxy (/api) so requests go through
 * the dev-server proxy in development. Set VITE_ORCHESTRATOR_URL to
 * target a specific backend directly.
 */

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined

/** Resolved base for all REST calls (empty string = same origin / proxy). */
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

if (import.meta.env.DEV) {
  console.log(`[API] base → ${BASE}`)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (import.meta.env.DEV && method !== 'GET') {
    console.log(`[Simulator][REST] ${method} ${path}`, body ?? '')
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${method} ${path}: ${text}`)
  }
  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── DTOs (match Fabrik3D.Contracts) ────────────────────────────────

export interface JobDto {
  id: string
  name: string
  description: string
  status: string
  machineMode: string
  createdAtUtc: string
  updatedAtUtc: string
  startedAtUtc: string | null
  completedAtUtc: string | null
  pausedAtUtc: string | null
  stoppedAtUtc: string | null
  currentTaskIndex: number
  progressPercent: number
  simulationSessionId: string | null
  metadata: Record<string, string>
}

export interface TaskDto {
  id: string
  jobId: string
  name: string
  description: string
  status: string
  sequenceOrder: number
  partType: string
  palletId: string | null
  slotRow: number
  slotColumn: number
  createdAtUtc: string
  updatedAtUtc: string
  startedAtUtc: string | null
  completedAtUtc: string | null
  errorMessage: string | null
}

export interface SimulationSessionDto {
  id: string
  jobId: string
  status: string
  startedAtUtc: string
  endedAtUtc: string | null
  isPaused: boolean
  currentPhase: string
  currentPalletId: string | null
  currentTaskId: string | null
  currentPartId: string | null
  machinedCount: number
  remainingCount: number
  totalCount: number
  lastHeartbeatUtc: string
}

export interface MachineStateDto {
  id: string
  simulationSessionId: string | null
  machineMode: string
  simulationStatus: string
  robotState: string
  cncState: string
  currentPhase: string
  currentPalletId: string | null
  currentTaskId: string | null
  currentPartId: string | null
  currentSlotRow: number
  currentSlotColumn: number
  isRunning: boolean
  isPaused: boolean
  lastUpdatedAtUtc: string
}

export interface CreateJobRequest {
  name: string
  description?: string
  machineMode?: string
  tasks?: CreateTaskRequest[]
  metadata?: Record<string, string>
}

export interface CreateTaskRequest {
  name: string
  description?: string
  partType?: string
  palletId?: string
  slotRow?: number
  slotColumn?: number
}

export interface UpdateMachineStateRequest {
  simulationSessionId?: string | null
  machineMode?: string
  simulationStatus?: string
  robotState?: string
  cncState?: string
  currentPhase?: string
  currentPalletId?: string | null
  currentTaskId?: string | null
  currentPartId?: string | null
  currentSlotRow?: number
  currentSlotColumn?: number
  isRunning?: boolean
  isPaused?: boolean
}

export interface UpdateSimulationStateRequest {
  status?: string
  currentPhase?: string
  currentPalletId?: string | null
  currentTaskId?: string | null
  currentPartId?: string | null
  machinedCount?: number
  remainingCount?: number
  totalCount?: number
  isPaused?: boolean
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

// ── Simulation sessions ────────────────────────────────────────────

export const getSessionById = (id: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/${id}`)

export const getSessionByJob = (jobId: string) =>
  request<SimulationSessionDto>('GET', `/simulation-sessions/by-job/${jobId}`)

export const updateSimulationSessionState = (id: string, payload: UpdateSimulationStateRequest) =>
  request<SimulationSessionDto>('PUT', `/simulation-sessions/${id}/state`, payload)

export const heartbeatSimulationSession = (id: string) =>
  request<SimulationSessionDto>('POST', `/simulation-sessions/${id}/heartbeat`)

// ── Machine state ──────────────────────────────────────────────────

export const getCurrentMachineState = () =>
  request<MachineStateDto | undefined>('GET', '/machine-state/current')

export const updateCurrentMachineState = (payload: UpdateMachineStateRequest) =>
  request<MachineStateDto>('PUT', '/machine-state/current', payload)
