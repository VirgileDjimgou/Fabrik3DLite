import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * End-to-end training flow over the live orchestrator (S44): a learner starts a session, reports
 * evidence, completes it, and the server returns a deterministic assessment and an educational-scope
 * report. The test also proves that another learner cannot read the session and that the public demo
 * identity cannot start one.
 */

async function token(request: APIRequestContext, role: string, subject: string): Promise<string> {
  const response = await request.post('/api/auth/dev-token', { data: { role, subject } })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { accessToken: string }).accessToken
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

test('scenario run is persisted, assessed server-side and exported with its educational scope', async ({ request }) => {
  const suffix = Date.now()
  const learnerSubject = `e2e-learner-${suffix}`
  const learnerToken = await token(request, 'Learner', learnerSubject)

  const started = await request.post('/api/training/sessions', {
    headers: headers(learnerToken),
    data: { scenarioId: 'pick-and-place', expectedActions: ['PICK_PART', 'COMPLETE'] },
  })
  expect(started.status()).toBe(201)
  const session = (await started.json()) as { id: string; learnerSubject: string; status: string }
  expect(session.learnerSubject).toBe(learnerSubject)
  expect(session.status).toBe('running')

  const batch = {
    actions: [
      { actionId: 'a1', role: 'observed', type: 'PICK_PART', sequence: 1 },
      { actionId: 'f1', role: 'observed', type: 'fault', sequence: 2, isFault: true },
      {
        actionId: 'r1',
        role: 'observed',
        type: 'recovery',
        sequence: 3,
        isRecovery: true,
        recovery: { faultId: 'f1', successful: true },
      },
      { actionId: 'a2', role: 'observed', type: 'COMPLETE', sequence: 4 },
    ],
  }

  const ingested = await request.post(`/api/training/sessions/${session.id}/actions`, {
    headers: headers(learnerToken),
    data: batch,
  })
  expect(ingested.ok()).toBeTruthy()
  expect(((await ingested.json()) as { inserted: number }).inserted).toBe(4)

  // Reconnect-safe retry: the same batch is idempotent.
  const retried = await request.post(`/api/training/sessions/${session.id}/actions`, {
    headers: headers(learnerToken),
    data: batch,
  })
  expect(((await retried.json()) as { inserted: number; duplicates: number }).duplicates).toBe(4)

  const completed = await request.post(`/api/training/sessions/${session.id}/complete`, {
    headers: headers(learnerToken),
    data: { completed: true, completionPercent: 100 },
  })
  expect(completed.ok()).toBeTruthy()
  const final = (await completed.json()) as { status: string; score: number; possibleScore: number }
  expect(final.status).toBe('completed')
  expect(final.score).toBe(100)
  expect(final.possibleScore).toBe(100)

  const report = await request.get(`/api/training/sessions/${session.id}/report`, {
    headers: headers(learnerToken),
  })
  expect(report.ok()).toBeTruthy()
  const reportBody = (await report.json()) as {
    assessmentAuthority: string
    educationalScope: string
    disclaimer: string
    metrics: { faultsEncountered: number; recoveryActions: number }
  }
  expect(reportBody.assessmentAuthority).toBe('server')
  expect(reportBody.educationalScope).toBe('educational')
  expect(reportBody.disclaimer).toContain('does not certify')
  expect(reportBody.metrics.faultsEncountered).toBe(1)
  expect(reportBody.metrics.recoveryActions).toBe(1)

  // Another learner cannot read the session.
  const otherToken = await token(request, 'Learner', `e2e-other-learner-${suffix}`)
  const forbidden = await request.get(`/api/training/sessions/${session.id}`, {
    headers: headers(otherToken),
  })
  expect(forbidden.status()).toBe(403)

  // The public demo identity, when the server exposes the opt-in role, is read-only and cannot start
  // a session. When it is not enabled (the default), the dev-token issuer refuses to mint it at all,
  // which is the stricter outcome. Either way no demo identity can start a session.
  const config = await request.get('/api/auth/config')
  expect(config.ok()).toBeTruthy()
  const { publicDemoEnabled } = (await config.json()) as { publicDemoEnabled: boolean }
  if (publicDemoEnabled) {
    const demoToken = await token(request, 'PublicDemo', `e2e-demo-${suffix}`)
    const demoStart = await request.post('/api/training/sessions', {
      headers: headers(demoToken),
      data: { scenarioId: 'pick-and-place' },
    })
    expect(demoStart.status()).toBe(403)
  } else {
    const refused = await request.post('/api/auth/dev-token', {
      data: { role: 'PublicDemo', subject: `e2e-demo-${suffix}` },
    })
    expect(refused.status()).toBe(400)
  }
})
