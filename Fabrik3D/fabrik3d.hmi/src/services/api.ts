const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${method} ${path}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── DTOs ──

export interface JobDto {
  id: string; name: string; description: string; status: string
  machineMode: string; createdAtUtc: string; updatedAtUtc: string
  startedAtUtc: string | null; completedAtUtc: string | null
  pausedAtUtc: string | null; stoppedAtUtc: string | null
  currentTaskIndex: number; progressPercent: number
  simulationSessionId: string | null; metadata: Record<string, string>
}

export interface TaskDto {
  id: string; jobId: string; name: string; description: string
  status: string; sequenceOrder: number; partType: string
  palletId: string | null; slotRow: number; slotColumn: number
  createdAtUtc: string; updatedAtUtc: string
  startedAtUtc: string | null; completedAtUtc: string | null
  errorMessage: string | null
}

export interface SimulationSessionDto {
  id: string; jobId: string; status: string
  startedAtUtc: string; endedAtUtc: string | null; isPaused: boolean
  currentPhase: string; currentPalletId: string | null
  currentTaskId: string | null; currentPartId: string | null
  machinedCount: number; remainingCount: number; totalCount: number
  lastHeartbeatUtc: string
}

export interface MachineStateDto {
  id: string; simulationSessionId: string | null
  machineMode: string; simulationStatus: string
  robotState: string; cncState: string; currentPhase: string
  currentPalletId: string | null; currentTaskId: string | null
  currentPartId: string | null
  currentSlotRow: number; currentSlotColumn: number
  isRunning: boolean; isPaused: boolean; lastUpdatedAtUtc: string
}

export interface AlarmDto {
  id: string; code: string; title: string; message: string
  severity: string; source: string
  jobId: string | null; simulationSessionId: string | null
  createdAtUtc: string; acknowledged: boolean
  acknowledgedAtUtc: string | null; acknowledgedBy: string | null
}

export interface OperatorMessageDto {
  id: string; title: string; message: string
  type: string; source: string
  jobId: string | null; simulationSessionId: string | null
  createdAtUtc: string; read: boolean; readAtUtc: string | null
}

export interface CreateJobRequest {
  name: string; description?: string; machineMode?: string
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

// ── Messages ──
export const getMessages = (limit = 100) =>
  request<OperatorMessageDto[]>('GET', `/messages?limit=${limit}`)

// ── Health ──
export const getHealth = () =>
  request<{ status: string; timestamp: string; version: string }>('GET', '/health')
