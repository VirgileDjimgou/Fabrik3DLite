import { expect, test, type APIRequestContext } from '@playwright/test'

async function authHeaders(request: APIRequestContext, role: string): Promise<Record<string, string>> {
  const response = await request.post('/api/auth/dev-token', {
    data: { role, subject: `e2e-composer-${role.toLowerCase()}-${Date.now()}` },
  })
  expect(response.ok()).toBeTruthy()
  const token = await response.json() as { accessToken: string }
  return { Authorization: `Bearer ${token.accessToken}` }
}

/**
 * S52 server-authoritative job composer, exercised through the live HTTP contract:
 *   options discovery → preview validation (valid/invalid/incompatible) → atomic creation with
 *   deterministic pallet-slot tasks → authoritative read-back. The server owns lifecycle,
 *   authorization and task generation; the HMI only submits a validated definition.
 */
test('composer previews and creates a deterministic pallet task definition', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  const headers = await authHeaders(request, 'Operator')
  const post = (url: string, data?: unknown) => request.post(url, { headers, data })
  const get = (url: string) => request.get(url, { headers })
  const del = (url: string) => request.delete(url, { headers })

  // ── Option discovery is a read and exposes cells/scenarios/bounds ────
  const optionsResponse = await get('/api/jobs/composer/options')
  expect(optionsResponse.status()).toBe(200)
  const options = await optionsResponse.json() as {
    cells: Array<{ id: string; compatibleScenarioIds: string[]; defaultScenarioId: string }>
    scenarios: Array<{ id: string }>
    maxRows: number
    maxColumns: number
    maxTasks: number
  }
  expect(options.cells.some(c => c.id === 'reference-cell')).toBeTruthy()
  expect(options.cells.some(c => c.id === 'vision-sorting-cell')).toBeTruthy()
  expect(options.maxTasks).toBeGreaterThan(0)

  const definition = {
    name: `E2E composer job ${Date.now()}`,
    description: 'Composer e2e',
    machineMode: 'Automatic',
    targetCellId: 'reference-cell',
    scenarioId: 'pallet-processing',
    priority: 4,
    partType: 'hex-billet',
    palletLayout: { palletId: 'e2e-pallet', rows: 2, columns: 2 },
    occupiedSlots: [{ row: 1, column: 0 }, { row: 0, column: 1 }],
  }

  // ── Preview is deterministic and does not persist anything ──────────
  const previewResponse = await post('/api/jobs/composer/preview', definition)
  expect(previewResponse.status()).toBe(200)
  const preview = await previewResponse.json() as {
    valid: boolean
    resolvedTargetCellId: string
    scenarioId: string
    taskCount: number
    tasks: Array<{ sequenceOrder: number; name: string; stableKey: string }>
    errors: unknown[]
  }
  expect(preview.valid).toBe(true)
  expect(preview.resolvedTargetCellId).toBe('reference-cell')
  expect(preview.scenarioId).toBe('pallet-processing')
  expect(preview.taskCount).toBe(2)
  expect(preview.tasks.map(t => t.sequenceOrder)).toEqual([0, 1])
  expect(preview.tasks.map(t => t.stableKey)).toEqual(['e2e-pallet:R0:C1', 'e2e-pallet:R1:C0'])
  expect(preview.errors).toHaveLength(0)

  // ── Invalid definitions fail before execution with actionable codes ─
  const noTasks = await post('/api/jobs/composer/preview', { ...definition, occupiedSlots: [] })
  expect(noTasks.status()).toBe(200)
  expect((await noTasks.json() as { valid: boolean; errors: Array<{ code: string }> }).errors
    .some(e => e.code === 'no_tasks')).toBeTruthy()

  const incompatible = await post('/api/jobs/composer/preview', { ...definition, scenarioId: 'sorting-normal-cycle' })
  expect((await incompatible.json() as { errors: Array<{ code: string }> }).errors
    .some(e => e.code === 'incompatible_scenario')).toBeTruthy()

  // ── Creation is atomic and returns the authoritative job ────────────
  const created = await post('/api/jobs/composer', definition)
  expect(created.status()).toBe(201)
  const job = await created.json() as {
    id: string; status: string; targetCellId: string; scenarioId: string; priority: number
    palletId: string; palletRows: number; palletColumns: number; taskCount: number; progressPercent: number
  }
  expect(job.status).toBe('Created')
  expect(job.targetCellId).toBe('reference-cell')
  expect(job.scenarioId).toBe('pallet-processing')
  expect(job.priority).toBe(4)
  expect(job.palletId).toBe('e2e-pallet')
  expect(job.taskCount).toBe(2)
  expect(job.progressPercent).toBe(0)

  const tasks = await (await get(`/api/jobs/${job.id}/tasks`)).json() as Array<{
    name: string; status: string; sequenceOrder: number; slotRow: number; slotColumn: number; isRequired: boolean
  }>
  expect(tasks).toHaveLength(2)
  expect(tasks.map(t => t.sequenceOrder)).toEqual([0, 1])
  expect(tasks.map(t => t.name)).toEqual(['Slot R0 C1', 'Slot R1 C0'])
  expect(tasks.every(t => t.status === 'Pending' && t.isRequired)).toBeTruthy()

  // ── Existing jobs remain readable (backward compatibility) ──────────
  const list = await get('/api/jobs')
  expect(list.status()).toBe(200)
  expect((await list.json() as Array<{ id: string }>).some(j => j.id === job.id)).toBeTruthy()

  // ── RBAC: submission requires Operate; anonymous is rejected ────────
  const learnerHeaders = await authHeaders(request, 'Learner')
  const learnerCreate = await request.post('/api/jobs/composer', { headers: learnerHeaders, data: definition })
  expect(learnerCreate.status()).toBe(403)

  const anonymous = await request.post('/api/jobs/composer/preview', { data: definition })
  expect(anonymous.status()).toBe(401)

  // ── Cleanup ─────────────────────────────────────────────────────────
  expect((await del(`/api/jobs/${job.id}`)).status()).toBe(204)
})
