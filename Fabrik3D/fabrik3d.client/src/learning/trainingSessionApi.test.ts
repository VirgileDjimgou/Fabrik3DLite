import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncTrainingRun, trainingSyncConfigured, TrainingSyncError } from './trainingSessionApi'
import { clearSession, setSession } from '@/auth/authStore'

function token(): string {
  const payload = btoa(JSON.stringify({
    sub: 'sim-learner',
    role: 'Learner',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${btoa('{"alg":"HS256"}')}.${payload}.sig`
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('training session sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    sessionStorage.clear()
  })

  it('is configured by default and can be explicitly disabled', () => {
    expect(trainingSyncConfigured()).toBe(true)
  })

  it('persists evidence and returns the server-computed assessment', async () => {
    setSession(token(), { subject: 'sim-learner', roles: ['Learner'], mode: 'Test' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 's1' }, 201))
      .mockResolvedValueOnce(jsonResponse({ inserted: 2, duplicates: 0 }))
      .mockResolvedValueOnce(jsonResponse({
        id: 's1',
        score: 90,
        possibleScore: 100,
        assessment: {
          effectiveScore: 90,
          effectivePossibleScore: 100,
          disclaimer: 'Educational training record. It does not certify professional competence.',
          assessmentVersion: 1,
        },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncTrainingRun({
      scenarioId: 'pallet-processing',
      expectedActions: ['PICK_PART'],
      observedActions: ['PICK_PART', 'COMPLETE'],
      completed: true,
    })

    expect(result).toMatchObject({ authority: 'server', sessionId: 's1', score: 90, possibleScore: 100 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const startInit = fetchMock.mock.calls[0]![1] as RequestInit
    expect((startInit.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
    expect(String(startInit.body)).toContain('pallet-processing')
  })

  it('marks server errors as retryable without discarding the local report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server down', { status: 503 })))

    await expect(syncTrainingRun({ scenarioId: 'pallet-processing', completed: false }))
      .rejects.toBeInstanceOf(TrainingSyncError)

    try {
      await syncTrainingRun({ scenarioId: 'pallet-processing', completed: false })
    } catch (error) {
      expect((error as TrainingSyncError).retryable).toBe(true)
      expect((error as TrainingSyncError).status).toBe(503)
    }
  })

  it('marks a rejected request as non-retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })))

    try {
      await syncTrainingRun({ scenarioId: '', completed: false })
      throw new Error('expected sync to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(TrainingSyncError)
      expect((error as TrainingSyncError).retryable).toBe(false)
    }
  })
})
