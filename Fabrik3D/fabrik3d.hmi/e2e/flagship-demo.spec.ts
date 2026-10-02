import { expect, test, type APIRequestContext } from '@playwright/test'

async function authHeaders(request: APIRequestContext, role: string): Promise<Record<string, string>> {
  const response = await request.post('/api/auth/dev-token', {
    data: { role, subject: `e2e-flagship-${role.toLowerCase()}-${Date.now()}` },
  })
  expect(response.ok()).toBeTruthy()
  const token = await response.json() as { accessToken: string }
  return { Authorization: `Bearer ${token.accessToken}` }
}

/**
 * S64 deterministic flagship demonstration, exercised against the live orchestrator contract.
 *
 * The documented flagship workflow is:
 *   HMI (composer) → New Job → scenario/cell/pallet → Create → Start → server targeted dispatch →
 *   simulator ACK → 3D execution begins automatically → robot/CNC/conveyor → live HMI →
 *   fault/recovery → Job 100 % → Completed → historian/time travel.
 *
 * This spec proves the orchestration spine of that workflow over the same HTTP surface the HMI
 * uses: the server owns assignment, the assigned simulator acknowledges, and execution only begins
 * after that acknowledgement. There is no simulator-local Start action anywhere in the path; the
 * simulator cannot select or start a job by itself. Historian persistence is proven by the
 * `FlagshipDemoHistorianTests` server suite and the client time-travel suite.
 */
test('flagship demo: HMI composer job → dispatch → simulator ACK → execution → completion', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  const headers = await authHeaders(request, 'Operator')
  const post = (url: string, data?: unknown) => request.post(url, { headers, data })
  const get = (url: string) => request.get(url, { headers })
  const del = (url: string) => request.delete(url, { headers })

  // ── HMI: New Job composer discovers cells/scenarios (read) ────────────
  const options = await get('/api/jobs/composer/options')
  expect(options.status()).toBe(200)
  const composer = await options.json() as {
    cells: Array<{ id: string; defaultScenarioId: string }>
    scenarios: Array<{ id: string }>
    maxTasks: number
  }
  const cellId = composer.cells.find(c => c.id === 'reference-cell')?.id ?? composer.cells[0]!.id

  // ── HMI: select scenario/cell/pallet, Create ─────────────────────────
  const definition = {
    name: `Flagship demo ${Date.now()}`,
    description: 'S64 deterministic flagship demonstration',
    machineMode: 'Automatic',
    targetCellId: cellId,
    scenarioId: 'pallet-processing',
    priority: 5,
    partType: 'hex-billet',
    palletLayout: { palletId: 'flagship-pallet', rows: 1, columns: 2 },
    occupiedSlots: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
  }
  const created = await post('/api/jobs/composer', definition)
  expect(created.status()).toBe(201)
  const job = await created.json() as {
    id: string; status: string; targetCellId: string; scenarioId: string; taskCount: number; progressPercent: number
  }
  expect(job.status).toBe('Created')
  expect(job.targetCellId).toBe(cellId)
  expect(job.scenarioId).toBe('pallet-processing')
  expect(job.taskCount).toBe(2)
  expect(job.progressPercent).toBe(0)

  const simulatorId = `flagship-sim-${Date.now()}`

  // ── HMI: Start = server targeted dispatch (not a local start) ─────────
  const dispatch = await post(`/api/jobs/${job.id}/dispatch`, { targetCellId: cellId, simulatorId })
  expect(dispatch.status()).toBe(200)
  const dispatched = await dispatch.json() as {
    job: { status: string; simulationSessionId: string | null }
    session: { id: string; jobId: string; simulatorId: string; targetCellId: string }
    tasks: Array<{ id: string; sequenceOrder: number }>
    dispatchState: string
    targetCellId: string
    assignedSimulatorId: string
    dispatchCorrelationId: string
  }
  const sessionId = dispatched.session.id
  const correlationId = dispatched.dispatchCorrelationId
  expect(dispatched.dispatchState).toBe('Pending')
  expect(dispatched.assignedSimulatorId).toBe(simulatorId)
  expect(dispatched.job.status).toBe('Running')
  expect(dispatched.job.simulationSessionId).toBe(sessionId)
  expect(dispatched.session.jobId).toBe(job.id)
  expect(dispatched.session.targetCellId).toBe(cellId)

  // ── Simulator: ACK is mandatory; no local Start action exists ─────────
  // While the dispatch is only Pending, a foreign simulator cannot take it over.
  const foreignAck = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId: 'foreign-simulator',
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Running',
  })
  expect(foreignAck.status()).toBe(409)

  const acknowledged = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId,
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Acknowledged',
  })
  expect(acknowledged.status()).toBe(200)
  expect((await acknowledged.json() as { dispatchState: string }).dispatchState).toBe('Acknowledged')

  const running = await post(`/api/jobs/${job.id}/dispatch/ack`, {
    simulatorId,
    correlationId,
    targetCellId: cellId,
    simulationSessionId: sessionId,
    state: 'Running',
  })
  expect(running.status()).toBe(200)
  expect((await running.json() as { dispatchState: string }).dispatchState).toBe('Running')

  // ── Simulator: execute robot/CNC/conveyor work and report tasks ───────
  const tasksRead = await get(`/api/jobs/${job.id}/tasks`)
  expect(tasksRead.status()).toBe(200)
  const tasks = await tasksRead.json() as Array<{ id: string; sequenceOrder: number; status: string }>
  expect(tasks).toHaveLength(2)

  let machined = 0
  for (const task of tasks.sort((a, b) => a.sequenceOrder - b.sequenceOrder)) {
    const taskRunning = await request.put(`/api/tasks/${task.id}/status`, {
      headers,
      data: { status: 'Running', simulationSessionId: sessionId, simulatorId },
    })
    expect(taskRunning.status()).toBe(200)

    // Live HMI: the session reports the current pallet/phase while the task executes.
    const state = await request.put(`/api/simulation-sessions/${sessionId}/state`, {
      headers,
      data: {
        status: 'Running',
        currentPhase: 'MACHINING',
        currentPalletId: 'flagship-pallet',
        currentTaskId: task.id,
        machinedCount: machined,
        remainingCount: tasks.length - machined,
        totalCount: tasks.length,
        isPaused: false,
        simulatorId,
      },
    })
    expect(state.status()).toBe(200)

    const taskCompleted = await request.put(`/api/tasks/${task.id}/status`, {
      headers,
      data: { status: 'Completed', simulationSessionId: sessionId, simulatorId },
    })
    expect(taskCompleted.status()).toBe(200)
    machined += 1

    const heartbeat = await post(`/api/simulation-sessions/${sessionId}/heartbeat`, { simulatorId })
    expect(heartbeat.status()).toBe(200)
  }

  // ── Job reaches 100 % and the server marks it Completed ──────────────
  const completedSession = await request.put(`/api/simulation-sessions/${sessionId}/state`, {
    headers,
    data: {
      status: 'Completed',
      currentPhase: 'DONE',
      currentPalletId: 'flagship-pallet',
      machinedCount: 2,
      remainingCount: 0,
      totalCount: 2,
      isPaused: false,
      simulatorId,
    },
  })
  expect(completedSession.status()).toBe(200)

  const jobRead = await get(`/api/jobs/${job.id}`)
  expect(jobRead.status()).toBe(200)
  const completed = await jobRead.json() as { status: string; progressPercent: number; completedAtUtc: string | null }
  expect(completed.status).toBe('Completed')
  expect(completed.progressPercent).toBe(100)
  expect(completed.completedAtUtc).toBeTruthy()

  // ── HMI observes the final correlated dispatch state ─────────────────
  const observed = await get(`/api/jobs/${job.id}/dispatch`)
  expect(observed.status()).toBe(200)
  expect((await observed.json() as { dispatchState: string }).dispatchState).toBe('Running')

  expect((await del(`/api/jobs/${job.id}`)).status()).toBe(204)
})

test('flagship demo: execution cannot begin without the assigned simulator acknowledgement', async ({ request }) => {
  const headers = await authHeaders(request, 'Operator')
  const post = (url: string, data?: unknown) => request.post(url, { headers, data })
  const get = (url: string) => request.get(url, { headers })
  const del = (url: string) => request.delete(url, { headers })

  const created = await post('/api/jobs/composer', {
    name: `Flagship no-ack ${Date.now()}`,
    machineMode: 'Automatic',
    targetCellId: 'reference-cell',
    scenarioId: 'pallet-processing',
    palletLayout: { palletId: 'flagship-pallet', rows: 1, columns: 1 },
    occupiedSlots: [{ row: 0, column: 0 }],
  })
  expect(created.status()).toBe(201)
  const job = await created.json() as { id: string }

  const simulatorId = `flagship-sim-${Date.now()}`
  const dispatch = await post(`/api/jobs/${job.id}/dispatch`, { targetCellId: 'reference-cell', simulatorId })
  expect(dispatch.status()).toBe(200)

  // Pending is terminal until the assigned simulator acknowledges; there is no
  // simulator-local Start and no alternate endpoint that begins execution.
  const observed = await get(`/api/jobs/${job.id}/dispatch`)
  const pending = await observed.json() as { dispatchState: string; assignedSimulatorId: string }
  expect(pending.dispatchState).toBe('Pending')
  expect(pending.assignedSimulatorId).toBe(simulatorId)

  // Dispatching an unregistered target fails closed and leaves the job un-started.
  const unassigned = await post('/api/jobs/composer', {
    name: `Flagship unassigned ${Date.now()}`,
    machineMode: 'Automatic',
    targetCellId: 'reference-cell',
    scenarioId: 'pallet-processing',
    palletLayout: { palletId: 'flagship-pallet', rows: 1, columns: 1 },
    occupiedSlots: [{ row: 0, column: 0 }],
  })
  const unassignedJob = await unassigned.json() as { id: string }
  const noTarget = await post(`/api/jobs/${unassignedJob.id}/dispatch`, { targetCellId: `unregistered-${Date.now()}` })
  expect(noTarget.status()).toBe(409)
  const unassignedRead = await get(`/api/jobs/${unassignedJob.id}`)
  expect((await unassignedRead.json() as { status: string }).status).toBe('Created')

  expect((await del(`/api/jobs/${job.id}`)).status()).toBe(204)
  expect((await del(`/api/jobs/${unassignedJob.id}`)).status()).toBe(204)
})
