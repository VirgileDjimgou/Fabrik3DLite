import { expect, test, type APIRequestContext } from '@playwright/test'

/** Obtains a short-lived Test-mode identity token. The server refuses dev tokens in Production. */
async function authHeaders(request: APIRequestContext, role: string): Promise<Record<string, string>> {
  const response = await request.post('/api/auth/dev-token', {
    data: { role, subject: `e2e-${role.toLowerCase()}` },
  })
  expect(response.ok()).toBeTruthy()
  const token = await response.json() as { accessToken: string }
  return { Authorization: `Bearer ${token.accessToken}` }
}

test('orchestrator health check and authenticated job lifecycle', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  // Anonymous mutations are rejected server-side.
  const anonymous = await request.post('/api/jobs', { data: { name: 'anonymous' } })
  expect(anonymous.status()).toBe(401)

  const headers = await authHeaders(request, 'Operator')

  const created = await request.post('/api/jobs', {
    headers,
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
    const response = await request.post(`/api/jobs/${job.id}/${action}`, { headers })
    expect(response.ok()).toBeTruthy()
    expect((await response.json() as { status: string }).status).toBe(expectedStatus)
  }

  expect((await request.delete(`/api/jobs/${job.id}`, { headers })).status()).toBe(204)
})
