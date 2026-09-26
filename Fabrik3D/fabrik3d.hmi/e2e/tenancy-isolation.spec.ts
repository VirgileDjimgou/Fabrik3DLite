import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Two-organization isolation over the live orchestrator (S43). The test uses dedicated test
 * organizations and never the public demo. It proves that a client-supplied organization id is
 * validated against membership and that jobs created in one organization are invisible to another.
 */

async function token(request: APIRequestContext, role: string, subject: string): Promise<string> {
  const response = await request.post('/api/auth/dev-token', { data: { role, subject } })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { accessToken: string }).accessToken
}

function headers(token: string, organizationId?: string): Record<string, string> {
  const result: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (organizationId) result['X-Organization-Id'] = organizationId
  return result
}

test('forged organization selection is rejected and tenant data stays isolated', async ({ request }) => {
  const suffix = Date.now()
  const adminToken = await token(request, 'Administrator', `e2e-admin-${suffix}`)

  // Create two dedicated test organizations. The server returns their stable ids; the slug is only
  // a human-readable alias and never the tenant identifier.
  const organizationIds: string[] = []
  for (const [index, name] of ['E2E Org A', 'E2E Org B'].entries()) {
    const created = await request.post('/api/organizations', {
      headers: headers(adminToken),
      data: { name, slug: `e2e-org-${index}-${suffix}` },
    })
    expect(created.status()).toBe(201)
    organizationIds.push(((await created.json()) as { id: string }).id)
  }
  const orgA = organizationIds[0]!

  // A forged organization id (no membership) is rejected before any tenant data is read and never
  // reveals whether the organization exists.
  const forgedToken = await token(request, 'Operator', `e2e-forged-${suffix}`)
  const forged = await request.get('/api/organizations/context', {
    headers: headers(forgedToken, orgA),
  })
  expect(forged.status()).toBe(403)
  expect(((await forged.json()) as { code: string }).code).toBe('organization_not_available')

  // Grant membership in organization A only.
  const operatorSubject = `e2e-operator-${suffix}`
  const membership = await request.put(`/api/organizations/${orgA}/memberships`, {
    headers: headers(adminToken),
    data: { subject: operatorSubject, role: 'Operator', status: 'Active' },
  })
  expect(membership.ok()).toBeTruthy()

  const operatorToken = await token(request, 'Operator', operatorSubject)
  const context = await request.get('/api/organizations/context', {
    headers: headers(operatorToken, orgA),
  })
  expect(context.ok()).toBeTruthy()
  expect(((await context.json()) as { organizationId: string }).organizationId).toBe(orgA)

  // Create a job inside organization A.
  const createdJob = await request.post('/api/jobs', {
    headers: headers(operatorToken, orgA),
    data: { name: `E2E tenant job ${suffix}` },
  })
  expect(createdJob.status()).toBe(201)
  const job = (await createdJob.json()) as { id: string }

  // Organization A sees it; the default organization does not.
  const ownList = await request.get('/api/jobs', { headers: headers(operatorToken, orgA) })
  expect(ownList.ok()).toBeTruthy()
  expect(((await ownList.json()) as Array<{ id: string }>).some((entry) => entry.id === job.id)).toBeTruthy()

  const otherToken = await token(request, 'Operator', `e2e-other-${suffix}`)
  const otherList = await request.get('/api/jobs', { headers: headers(otherToken) })
  expect(otherList.ok()).toBeTruthy()
  expect(((await otherList.json()) as Array<{ id: string }>).some((entry) => entry.id === job.id)).toBeFalsy()

  // Cross-organization object id behaves as not found, without leaking existence.
  const crossRead = await request.get(`/api/jobs/${job.id}`, { headers: headers(otherToken) })
  expect(crossRead.status()).toBe(404)
})
