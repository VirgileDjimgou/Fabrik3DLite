import { expect, test, type APIRequestContext } from '@playwright/test'

async function authHeaders(request: APIRequestContext, role: string): Promise<Record<string, string>> {
  const response = await request.post('/api/auth/dev-token', {
    data: { role, subject: `e2e-${role.toLowerCase()}` },
  })
  expect(response.ok()).toBeTruthy()
  const token = await response.json() as { accessToken: string }
  return { Authorization: `Bearer ${token.accessToken}` }
}

/**
 * S51 end-to-end proof of the server-authoritative dispatch path:
 *   HMI Start intent → server assigns one compatible target → targeted execution request →
 *   simulator claim/ACK → Running, with no simulator-local Start action.
 *
 * The simulator is represented by its registered cell capability and its ACK calls; the server
 * owns assignment, session creation and dispatch state. A foreign simulator cannot claim the job.
 */
test('HMI Start dispatches to one assigned simulator and reaches Running without a local Start', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  const headers = await authHeaders(request, 'Operator')
  const post = (url: string, data?: unknown) => request.post(url, { headers, data })
  const get = (url: string) => request.get(url, { headers })
  const del = (url: string) => request.delete(url, { headers })

  const cellId = `e2e-cell-${Date.now()}`
  const simulatorId = `e2e-sim-${Date.now()}`

  // ── HMI role: prepare a valid job with pallet-slot tasks ─────────────
  const created = await post('/api/jobs', {
    name: `E2E dispatch job ${Date.now()}`,
    description: 'Authoritative dispatch workflow',
    machineMode: 'Automatic',
    tasks: [
      { name: 'Machine slot R0 C0', partType: 'hex-billet', palletId: 'e2e-pallet', slotRow: 0, slotColumn: 0 },
      { name: 'Machine slot R0 C1', partType: 'hex-billet', palletId: 'e2e-pallet', slotRow: 0, slotColumn: 1 },
    ],
  })
  expect(created.status()).toBe(201)
  const job = await created.json() as { id: string; status: string }
  expect(job.status).toBe('Created')

  // ── HMI role: press Start (dispatch) with an explicit target cell ────
  // The simulator registers its cell capability through the hub; the API test supplies the
  // explicit simulator id so the assignment is deterministic without a live hub connection.
  const dispatch = await post(`/api/jobs/${job.id}/dispatch`, {
    targetCellId: cellId,
    simulatorId,
  })
  expect(dispatch.status()).toBe(200)
  const dispatched = await dispatch.json() as {
    job: { id: string; status: string; simulationSessionId: string | null; dispatchState: string; targetCellId: string; assignedSimulatorId: string }
    session: { id: string; jobId: string; simulatorId: string; targetCellId: string }
    tasks: Array<{ id: string; jobId: string }>
    dispatchState: string
    targetCellId: string
    assignedSimulatorId: string
    dispatchCorrelationId: string
  }
  expect(dispatched.dispatchState).toBe('Pending')
  expect(dispatched.targetCellId).toBe(cellId)
  expect(dispatched.assignedSimulatorId).toBe(simulatorId)
  expect(dispatched.job.status).toBe('Running')
  expect(dispatched.job.simulationSessionId).toBe(dispatched.session.id)
  expect(dispatched.session.targetCellId).toBe(cellId)
  expect(dispatched.tasks).toHaveLength(2)
  const sessionId = dispatched.session.id
  const correlationId = dispatched.dispatchCorrelationId

  // ── A foreign simulator cannot claim the assigned dispatch ───────────
  const foreignAck = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId: 'foreign-simulator',
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Acknowledged',
  })
  expect(foreignAck.status()).toBe(409)

  // ── Assigned simulator acknowledges and reports Running ──────────────
  const ack = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId,
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Acknowledged',
  })
  expect(ack.status()).toBe(200)
  expect((await ack.json() as { dispatchState: string }).dispatchState).toBe('Acknowledged')

  const running = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId,
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Running',
  })
  expect(running.status()).toBe(200)
  expect((await running.json() as { dispatchState: string }).dispatchState).toBe('Running')

  // ── Duplicate ACK is idempotent ──────────────────────────────────────
  const duplicate = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId,
    correlationId,
    state: 'Running',
  })
  expect(duplicate.status()).toBe(200)
  expect((await duplicate.json() as { dispatchState: string }).dispatchState).toBe('Running')

  // ── HMI observes the correlated dispatch state ───────────────────────
  const read = await get(`/api/jobs/${job.id}/dispatch`)
  expect(read.status()).toBe(200)
  const observed = await read.json() as {
    dispatchState: string; targetCellId: string; assignedSimulatorId: string; dispatchCorrelationId: string
  }
  expect(observed.dispatchState).toBe('Running')
  expect(observed.targetCellId).toBe(cellId)
  expect(observed.assignedSimulatorId).toBe(simulatorId)
  expect(observed.dispatchCorrelationId).toBe(correlationId)

  // ── Pause/resume/stop remain coherent with the assigned target ───────
  const paused = await post(`/api/jobs/${job.id}/pause`)
  expect(paused.status()).toBe(200)
  expect((await paused.json() as { status: string }).status).toBe('Paused')

  const resumed = await post(`/api/jobs/${job.id}/resume`)
  expect(resumed.status()).toBe(200)
  expect((await resumed.json() as { status: string }).status).toBe('Running')

  const stopped = await post(`/api/jobs/${job.id}/stop`)
  expect(stopped.status()).toBe(200)
  expect((await stopped.json() as { status: string }).status).toBe('Stopped')

  // ── Cleanup ──────────────────────────────────────────────────────────
  expect((await del(`/api/jobs/${job.id}`)).status()).toBe(204)
})

test('dispatch without an available target fails without starting the job', async ({ request }) => {
  const headers = await authHeaders(request, 'Operator')
  const post = (url: string, data?: unknown) => request.post(url, { headers, data })
  const get = (url: string) => request.get(url, { headers })
  const del = (url: string) => request.delete(url, { headers })

  const created = await post('/api/jobs', {
    name: `E2E no-target job ${Date.now()}`,
    machineMode: 'Automatic',
    tasks: [{ name: 'Slot', partType: 'hex-billet', palletId: 'e2e-pallet', slotRow: 0, slotColumn: 0 }],
  })
  expect(created.status()).toBe(201)
  const job = await created.json() as { id: string }

  const dispatch = await post(`/api/jobs/${job.id}/dispatch`, {
    targetCellId: `unregistered-${Date.now()}`,
  })
  expect(dispatch.status()).toBe(409)

  // The job is not left Running.
  const read = await get(`/api/jobs/${job.id}`)
  expect(read.status()).toBe(200)
  expect((await read.json() as { status: string }).status).toBe('Created')

  expect((await del(`/api/jobs/${job.id}`)).status()).toBe(204)
})
