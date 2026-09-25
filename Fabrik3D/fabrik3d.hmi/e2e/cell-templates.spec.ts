import { expect, test, type APIRequestContext } from '@playwright/test'

const SAMPLE = JSON.stringify({
  schemaVersion: '1.0',
  id: 'e2e-sample-cell',
  name: 'E2E sample cell',
  worldFrameId: 'world',
  equipment: [
    { id: 'robot-1', definitionId: 'medium-6axis', transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } },
  ],
})

async function authHeaders(request: APIRequestContext, role: string): Promise<Record<string, string>> {
  const response = await request.post('/api/auth/dev-token', {
    data: { role, subject: `e2e-${role.toLowerCase()}` },
  })
  expect(response.ok()).toBeTruthy()
  const token = await response.json() as { accessToken: string }
  return { Authorization: `Bearer ${token.accessToken}` }
}

test('cell templates are authorized, persisted, validated, and deleted through the orchestrator', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  const engineer = await authHeaders(request, 'Engineer')
  const learner = await authHeaders(request, 'Learner')
  const instructor = await authHeaders(request, 'Instructor')

  // Reads are allowed for any authenticated role; engineering writes are not.
  const learnerWrite = await request.post('/api/cell-templates', {
    headers: learner,
    data: { name: 'Learner cell', content: SAMPLE },
  })
  expect(learnerWrite.status()).toBe(403)

  // An authenticated instructor action: the training role may read but cannot mutate engineering data.
  const instructorRead = await request.get('/api/cell-templates', { headers: instructor })
  expect(instructorRead.ok()).toBeTruthy()
  const instructorWrite = await request.post('/api/cell-templates', {
    headers: instructor,
    data: { name: 'Instructor cell', content: SAMPLE },
  })
  expect(instructorWrite.status()).toBe(403)

  // Create
  const created = await request.post('/api/cell-templates', {
    headers: engineer,
    data: { name: `E2E cell ${Date.now()}`, content: SAMPLE },
  })
  expect(created.status()).toBe(201)
  const template = await created.json() as { id: string; name: string; schemaVersion: string; content: string }
  expect(template.schemaVersion).toBe('1.0')
  expect(template.content).toBe(SAMPLE)

  // List + get preserve the content verbatim
  const list = await request.get('/api/cell-templates', { headers: engineer })
  expect(list.ok()).toBeTruthy()
  const templates = await list.json() as Array<{ id: string; name: string }>
  expect(templates.some((t) => t.id === template.id)).toBe(true)

  const fetched = await request.get(`/api/cell-templates/${template.id}`, { headers: engineer })
  expect(fetched.status()).toBe(200)
  expect((await fetched.json() as { content: string }).content).toBe(SAMPLE)

  // Update
  const updated = await request.put(`/api/cell-templates/${template.id}`, {
    headers: engineer,
    data: { name: 'E2E cell renamed', content: SAMPLE },
  })
  expect(updated.status()).toBe(200)
  expect((await updated.json() as { name: string }).name).toBe('E2E cell renamed')

  // Malformed content is rejected with a useful diagnostic
  const malformed = await request.post('/api/cell-templates', {
    headers: engineer,
    data: { name: 'Bad', content: 'not json' },
  })
  expect(malformed.status()).toBe(409)

  // Delete
  expect((await request.delete(`/api/cell-templates/${template.id}`, { headers: engineer })).status()).toBe(204)
  expect((await request.get(`/api/cell-templates/${template.id}`, { headers: engineer })).status()).toBe(404)
})
