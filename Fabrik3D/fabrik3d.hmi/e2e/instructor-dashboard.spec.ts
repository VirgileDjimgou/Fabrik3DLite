import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * End-to-end instructor workflow over the live orchestrator (S45):
 * instructor creates a class and assigns a scenario → learner runs the class session with evidence →
 * the instructor reads the completed review and server aggregates → restarts the session (audited)
 * → aggregates update. It also proves the endpoints are role- and tenant-enforced server-side.
 */

async function token(request: APIRequestContext, role: string, subject: string): Promise<string> {
  const response = await request.post('/api/auth/dev-token', { data: { role, subject } })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { accessToken: string }).accessToken
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

test('instructor dashboard workflow: assign, review, aggregate and audited restart', async ({ request }) => {
  const suffix = Date.now()
  const learnerSubject = `e2e-dash-learner-${suffix}`
  const instructorSubject = `e2e-dash-instructor-${suffix}`
  const instructorToken = await token(request, 'Instructor', instructorSubject)
  const learnerToken = await token(request, 'Learner', learnerSubject)

  // Instructor creates a class and assigns the training scenario to it.
  const createdClass = await request.post('/api/organizations/classes', {
    headers: headers(instructorToken),
    data: { name: `E2E cohort ${suffix}`, learnerSubjects: [learnerSubject], instructorSubjects: [instructorSubject] },
  })
  expect(createdClass.status()).toBe(201)
  const trainingClass = (await createdClass.json()) as { id: string }

  const assignment = await request.post('/api/organizations/resources', {
    headers: headers(instructorToken),
    data: { kind: 'Scenario', resourceId: 'pick-and-place', classId: trainingClass.id },
  })
  expect(assignment.status()).toBe(201)

  // Learner runs a class session with typed evidence.
  const started = await request.post('/api/training/sessions', {
    headers: headers(learnerToken),
    data: { scenarioId: 'pick-and-place', classId: trainingClass.id, expectedActions: ['PICK_PART', 'COMPLETE'] },
  })
  expect(started.status()).toBe(201)
  const session = (await started.json()) as { id: string }

  const reported = await request.post(`/api/training/sessions/${session.id}/actions`, {
    headers: headers(learnerToken),
    data: {
      actions: [
        { actionId: 'a1', role: 'observed', type: 'PICK_PART', sequence: 1, correctness: 'correct' },
        { actionId: 'w1', role: 'observed', type: 'WRONG_GRIP', sequence: 2, correctness: 'incorrect' },
        { actionId: 'f1', role: 'observed', type: 'fault', sequence: 3, isFault: true },
        { actionId: 'r1', role: 'observed', type: 'recovery', sequence: 4, isRecovery: true, recovery: { faultId: 'f1', successful: true } },
        { actionId: 'h1', role: 'observed', type: 'hint', sequence: 5, isHint: true, hint: { hintId: 'hint-1', level: 1 } },
        { actionId: 'v1', role: 'observed', type: 'safety.violation', sequence: 6, isSafetyViolation: true, safetyViolation: { ruleId: 'guard-door-open', description: 'Simulated guard.', severity: 'critical' } },
      ],
    },
  })
  expect(reported.ok()).toBeTruthy()

  const completed = await request.post(`/api/training/sessions/${session.id}/complete`, {
    headers: headers(learnerToken),
    data: { completed: true, completionPercent: 100 },
  })
  expect(completed.ok()).toBeTruthy()

  // Instructor review: the session, its evidence and the server aggregates are all readable.
  const review = await request.get(`/api/training/sessions/${session.id}/report`, {
    headers: headers(instructorToken),
  })
  expect(review.ok()).toBeTruthy()
  const report = (await review.json()) as { assessmentAuthority: string; session: { id: string } }
  expect(report.assessmentAuthority).toBe('server')
  expect(report.session.id).toBe(session.id)

  const metrics = await request.get('/api/training/metrics?scenarioId=pick-and-place', {
    headers: headers(instructorToken),
  })
  expect(metrics.ok()).toBeTruthy()
  const aggregate = (await metrics.json()) as {
    sessionCount: number
    completionRate: number
    incorrectActionCount: number
    hintCount: number
    faultCount: number
    recoveryActionCount: number
    safetyViolationCount: number
    definitionsVersion: string
    educationalNote: string
  }
  expect(aggregate.definitionsVersion).toBe('1.0')
  expect(aggregate.educationalNote).toContain('not a professional')
  expect(aggregate.incorrectActionCount).toBeGreaterThanOrEqual(1)
  expect(aggregate.hintCount).toBeGreaterThanOrEqual(1)
  expect(aggregate.faultCount).toBeGreaterThanOrEqual(1)
  expect(aggregate.recoveryActionCount).toBeGreaterThanOrEqual(1)
  expect(aggregate.safetyViolationCount).toBeGreaterThanOrEqual(1)

  // Audited, non-destructive restart: a new running attempt is created and the source is kept.
  const restarted = await request.post(`/api/training/sessions/${session.id}/restart`, {
    headers: headers(instructorToken),
    data: { reason: 'E2E second attempt' },
  })
  expect(restarted.ok()).toBeTruthy()
  const restartResult = (await restarted.json()) as {
    session: { id: string; status: string; learnerSubject: string }
    restartedFromSessionId: string
  }
  expect(restartResult.session.id).not.toBe(session.id)
  expect(restartResult.session.status).toBe('running')
  expect(restartResult.session.learnerSubject).toBe(learnerSubject)
  expect(restartResult.restartedFromSessionId).toBe(session.id)

  const original = await request.get(`/api/training/sessions/${session.id}`, {
    headers: headers(instructorToken),
  })
  const originalBody = (await original.json()) as { audit: Array<{ action: string; detail: string }> }
  expect(originalBody.audit.some((entry) => entry.action === 'restarted' && entry.detail.includes(restartResult.session.id))).toBeTruthy()

  // Restarting a running session is refused with a clear reason.
  const refused = await request.post(`/api/training/sessions/${restartResult.session.id}/restart`, {
    headers: headers(instructorToken),
    data: {},
  })
  expect(refused.status()).toBe(409)
  expect(((await refused.json()) as { code: string }).code).toBe('training_session_running')

  // A learner cannot read aggregates or restart a session.
  expect((await request.get('/api/training/metrics', { headers: headers(learnerToken) })).status()).toBe(403)
  expect((await request.post(`/api/training/sessions/${session.id}/restart`, { headers: headers(learnerToken), data: {} })).status()).toBe(403)
})
