import { getAccessToken } from '@/auth/authStore'

/**
 * Client-side training-session sync (S44).
 *
 * The simulator remains fully usable offline: local reports are always produced locally. When the
 * server is reachable, the same evidence can be persisted server-side so the authoritative
 * deterministic assessment and durable instructor records exist. A sync failure is explicit and
 * retryable; the local report is never discarded and the server never trusts a client-supplied score.
 */

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

export interface TrainingSyncInput {
  scenarioId: string
  alias?: string
  expectedActions?: readonly string[]
  observedActions?: readonly string[]
  completed: boolean
  completionPercent?: number
}

export interface TrainingSyncResult {
  authority: 'server'
  sessionId: string
  score: number
  possibleScore: number
  disclaimer: string
  assessmentVersion: number
}

export class TrainingSyncError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TrainingSyncError'
    this.status = status
    this.retryable = status === 0 || status === 429 || status >= 500
  }
}

interface ServerAssessment {
  effectiveScore?: number
  computedScore?: number
  effectivePossibleScore?: number
  possibleScore?: number
  disclaimer?: string
  assessmentVersion?: number
  criteria?: unknown[]
}

interface ServerSession {
  id: string
  score?: number
  possibleScore?: number
  assessmentStatus?: string
  assessment?: ServerAssessment | null
}

/**
 * True unless training sync is explicitly disabled through <c>VITE_TRAINING_SYNC=off</c>. The
 * simulator stays local-only until the operator explicitly syncs a run.
 */
export function trainingSyncConfigured(): boolean {
  const flag = (import.meta.env.VITE_TRAINING_SYNC as string | undefined)?.trim().toLowerCase()
  return flag !== 'off' && flag !== 'disabled' && flag !== 'false'
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch (error) {
    throw new TrainingSyncError(`Training sync unavailable: ${(error as Error).message}`, 0)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new TrainingSyncError(`[${response.status}] ${text || path}`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

/**
 * Persists one completed simulation run as a server training session, reports its evidence in a
 * bounded batch, completes the session and returns the server-computed assessment summary.
 */
export async function syncTrainingRun(input: TrainingSyncInput): Promise<TrainingSyncResult> {
  const session = await request<ServerSession>('/training/sessions', {
    method: 'POST',
    body: JSON.stringify({
      scenarioId: input.scenarioId,
      alias: input.alias || undefined,
      expectedActions: [...(input.expectedActions ?? [])],
    }),
  })

  const observed = [...(input.observedActions ?? [])]
  if (observed.length > 0) {
    await request(`/training/sessions/${session.id}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        actions: observed.map((type, index) => ({
          actionId: `sync-${index}-${type}`,
          role: 'observed',
          type,
          sequence: index,
          timestampUtc: new Date().toISOString(),
        })),
      }),
    })
  }

  const completed = await request<ServerSession>(`/training/sessions/${session.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      completed: input.completed,
      completionPercent: input.completionPercent ?? (input.completed ? 100 : 0),
    }),
  })

  const assessment = completed.assessment ?? undefined
  return {
    authority: 'server',
    sessionId: completed.id,
    score: assessment?.effectiveScore ?? completed.score ?? 0,
    possibleScore: assessment?.effectivePossibleScore ?? completed.possibleScore ?? 0,
    disclaimer: assessment?.disclaimer ?? '',
    assessmentVersion: assessment?.assessmentVersion ?? 1,
  }
}
