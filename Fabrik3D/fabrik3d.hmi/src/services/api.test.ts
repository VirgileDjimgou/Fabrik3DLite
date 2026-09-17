import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJobs } from './api'

describe('orchestrator API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a useful error when the orchestrator rejects a request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Service unavailable', { status: 503 })))

    await expect(getJobs()).rejects.toThrow('[503] GET /jobs: Service unavailable')
  })

  it('preserves the normalized API error code and validation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'validation_failed',
      message: 'One or more request fields are invalid.',
      status: 400,
      details: { name: ['The Name field is required.'] },
    }), { status: 400 })))

    await expect(getJobs()).rejects.toMatchObject({
      code: 'validation_failed',
      status: 400,
      details: { name: ['The Name field is required.'] },
    })
  })
})
