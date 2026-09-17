import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJobs } from './api'

describe('orchestrator API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a useful error when the orchestrator rejects a request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Service unavailable', { status: 503 })))

    await expect(getJobs()).rejects.toThrow('[503] GET /jobs: Service unavailable')
  })
})
