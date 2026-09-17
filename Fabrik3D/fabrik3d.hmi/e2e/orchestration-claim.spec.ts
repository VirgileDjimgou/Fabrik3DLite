import { expect, test } from '@playwright/test'

/**
 * End-to-end proof that one selected HMI job drives the same simulator
 * session and pallet: the HMI creates the job, the simulator claims it,
 * and every read-back must show identical job/session/task identities.
 */
test('one HMI job drives one claimed simulator session and pallet', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  // ── HMI role: create the job with pallet-slot tasks ──────────────
  const created = await request.post('/api/jobs', {
    data: {
      name: `E2E claim job ${Date.now()}`,
      description: 'Coherent orchestration traceability workflow',
      machineMode: 'Automatic',
      tasks: [
        {
          name: 'Machine slot R0 C0',
          partType: 'hex-billet',
          palletId: 'e2e-pallet',
          slotRow: 0,
          slotColumn: 0,
        },
        {
          name: 'Machine slot R0 C1',
          partType: 'hex-billet',
          palletId: 'e2e-pallet',
          slotRow: 0,
          slotColumn: 1,
        },
      ],
    },
  })
  expect(created.status()).toBe(201)
  const job = await created.json() as {
    id: string; status: string; simulationSessionId: string | null
  }
  expect(job.status).toBe('Created')

  // ── Simulator role: claim the runnable job ───────────────────────
  const claim = await request.post(`/api/jobs/${job.id}/claim`, {
    data: { simulatorId: 'e2e-simulator' },
  })
  expect(claim.status()).toBe(200)
  const claimResult = await claim.json() as {
    job: { id: string; status: string; simulationSessionId: string | null }
    session: { id: string; jobId: string; simulatorId: string; status: string }
    tasks: Array<{ id: string; jobId: string; palletId: string | null; slotRow: number; slotColumn: number; status: string }>
  }
  expect(claimResult.job.id).toBe(job.id)
  expect(claimResult.job.status).toBe('Running')
  expect(claimResult.job.simulationSessionId).toBe(claimResult.session.id)
  expect(claimResult.session.jobId).toBe(job.id)
  expect(claimResult.session.simulatorId).toBe('e2e-simulator')
  expect(claimResult.session.status).toBe('Running')
  expect(claimResult.tasks).toHaveLength(2)
  const sessionId = claimResult.session.id

  // ── Duplicate claim by the same simulator is safe/idempotent ─────
  const duplicateClaim = await request.post(`/api/jobs/${job.id}/claim`, {
    data: { simulatorId: 'e2e-simulator' },
  })
  expect(duplicateClaim.status()).toBe(200)
  const duplicateResult = await duplicateClaim.json() as { session: { id: string } }
  expect(duplicateResult.session.id).toBe(sessionId)

  // ── A foreign simulator cannot silently steal the active job ─────
  const foreignClaim = await request.post(`/api/jobs/${job.id}/claim`, {
    data: { simulatorId: 'other-simulator' },
  })
  expect(foreignClaim.status()).toBe(409)

  // ── Simulator role: run the pallet slot tasks ────────────────────
  const firstTask = claimResult.tasks[0]
  expect(firstTask.palletId).toBe('e2e-pallet')
  expect(firstTask.jobId).toBe(job.id)

  const running = await request.put(`/api/tasks/${firstTask.id}/status`, {
    data: {
      status: 'Running',
      simulationSessionId: sessionId,
      simulatorId: 'e2e-simulator',
    },
  })
  expect(running.status()).toBe(200)

  const completed = await request.put(`/api/tasks/${firstTask.id}/status`, {
    data: {
      status: 'Completed',
      simulationSessionId: sessionId,
      simulatorId: 'e2e-simulator',
    },
  })
  expect(completed.status()).toBe(200)

  // Foreign task update is rejected
  const foreignTask = await request.put(`/api/tasks/${claimResult.tasks[1].id}/status`, {
    data: {
      status: 'Running',
      simulationSessionId: sessionId,
      simulatorId: 'other-simulator',
    },
  })
  expect(foreignTask.status()).toBe(409)

  // ── Simulator role: push session state and heartbeat ─────────────
  const state = await request.put(`/api/simulation-sessions/${sessionId}/state`, {
    data: {
      status: 'Running',
      currentPhase: 'MACHINING',
      currentPalletId: 'e2e-pallet',
      currentTaskId: firstTask.id,
      machinedCount: 1,
      remainingCount: 1,
      totalCount: 2,
      isPaused: false,
      simulatorId: 'e2e-simulator',
    },
  })
  expect(state.status()).toBe(200)

  const heartbeat = await request.post(`/api/simulation-sessions/${sessionId}/heartbeat`, {
    data: { simulatorId: 'e2e-simulator' },
  })
  expect(heartbeat.status()).toBe(200)

  // Foreign heartbeat is rejected
  const foreignHeartbeat = await request.post(`/api/simulation-sessions/${sessionId}/heartbeat`, {
    data: { simulatorId: 'other-simulator' },
  })
  expect(foreignHeartbeat.status()).toBe(409)

  // ── HMI role: the displayed task traces back to job/pallet/session ─
  const jobRead = await request.get(`/api/jobs/${job.id}`)
  expect(jobRead.status()).toBe(200)
  const jobDto = await jobRead.json() as { id: string; simulationSessionId: string }
  expect(jobDto.simulationSessionId).toBe(sessionId)

  const sessionRead = await request.get(`/api/simulation-sessions/${sessionId}`)
  expect(sessionRead.status()).toBe(200)
  const sessionDto = await sessionRead.json() as {
    jobId: string; currentPalletId: string | null; currentTaskId: string | null; status: string
  }
  expect(sessionDto.jobId).toBe(job.id)
  expect(sessionDto.currentPalletId).toBe('e2e-pallet')
  expect(sessionDto.currentTaskId).toBe(firstTask.id)
  expect(sessionDto.status).toBe('Running')

  const tasksRead = await request.get(`/api/jobs/${job.id}/tasks`)
  expect(tasksRead.status()).toBe(200)
  const tasks = await tasksRead.json() as Array<{
    id: string; jobId: string; palletId: string | null; status: string; slotRow: number; slotColumn: number
  }>
  const completedTask = tasks.find(t => t.id === firstTask.id)
  expect(completedTask).toBeTruthy()
  expect(completedTask?.status).toBe('Completed')
  expect(completedTask?.jobId).toBe(job.id)
  expect(completedTask?.palletId).toBe('e2e-pallet')

  // ── Cleanup ──────────────────────────────────────────────────────
  expect((await request.delete(`/api/jobs/${job.id}`)).status()).toBe(204)
})
