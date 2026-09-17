import { expect, test } from '@playwright/test'

test('orchestrator health check and job lifecycle', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  const created = await request.post('/api/jobs', {
    data: {
      name: `E2E machining job ${Date.now()}`,
      description: 'Isolated CI smoke workflow',
      machineMode: 'Automatic',
      tasks: [{
        name: 'Machine slot R0 C0',
        partType: 'hex-billet',
        palletId: 'e2e-pallet',
        slotRow: 0,
        slotColumn: 0,
      }],
    },
  })
  expect(created.status()).toBe(201)
  const job = await created.json() as { id: string; status: string }
  expect(job.status).toBe('Created')

  for (const [action, expectedStatus] of [
    ['start', 'Running'],
    ['pause', 'Paused'],
    ['resume', 'Running'],
    ['stop', 'Stopped'],
  ]) {
    const response = await request.post(`/api/jobs/${job.id}/${action}`)
    expect(response.ok()).toBeTruthy()
    expect((await response.json() as { status: string }).status).toBe(expectedStatus)
  }

  expect((await request.delete(`/api/jobs/${job.id}`)).status()).toBe(204)
})
