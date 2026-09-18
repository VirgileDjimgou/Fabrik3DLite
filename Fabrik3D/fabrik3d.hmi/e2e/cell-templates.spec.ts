import { expect, test } from '@playwright/test'

const SAMPLE = JSON.stringify({
  schemaVersion: '1.0',
  id: 'e2e-sample-cell',
  name: 'E2E sample cell',
  worldFrameId: 'world',
  equipment: [
    { id: 'robot-1', definitionId: 'medium-6axis', transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } },
  ],
})

test('cell templates are persisted, validated, and deleted through the orchestrator', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()

  // Create
  const created = await request.post('/api/cell-templates', {
    data: { name: `E2E cell ${Date.now()}`, content: SAMPLE },
  })
  expect(created.status()).toBe(201)
  const template = await created.json() as { id: string; name: string; schemaVersion: string; content: string }
  expect(template.schemaVersion).toBe('1.0')
  expect(template.content).toBe(SAMPLE)

  // List + get preserve the content verbatim
  const list = await request.get('/api/cell-templates')
  expect(list.ok()).toBeTruthy()
  const templates = await list.json() as Array<{ id: string; name: string }>
  expect(templates.some((t) => t.id === template.id)).toBe(true)

  const fetched = await request.get(`/api/cell-templates/${template.id}`)
  expect(fetched.status()).toBe(200)
  expect((await fetched.json() as { content: string }).content).toBe(SAMPLE)

  // Update
  const updated = await request.put(`/api/cell-templates/${template.id}`, {
    data: { name: 'E2E cell renamed', content: SAMPLE },
  })
  expect(updated.status()).toBe(200)
  expect((await updated.json() as { name: string }).name).toBe('E2E cell renamed')

  // Malformed content is rejected with a useful diagnostic
  const malformed = await request.post('/api/cell-templates', {
    data: { name: 'Bad', content: 'not json' },
  })
  expect(malformed.status()).toBe(409)

  // Delete
  expect((await request.delete(`/api/cell-templates/${template.id}`)).status()).toBe(204)
  expect((await request.get(`/api/cell-templates/${template.id}`)).status()).toBe(404)
})