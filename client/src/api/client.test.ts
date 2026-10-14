import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, REQUEST_TIMEOUT_MS, resolveApiBaseUrl } from './client.js'
import { ApiRequestError, ConfigurationError, NetworkError } from './errors.js'
import { listExpenses } from './expenses.js'
import { deleteExpense } from './expenses.js'
import { createSettlement } from './settlements.js'
import { installMockApi, route, success, failure } from '../test/mockApi.js'

// Captures the rejection so tests can assert on the error's fields.
type CapturedError = Error & Partial<NetworkError & ApiRequestError>

async function caught(promise: Promise<unknown>): Promise<CapturedError> {
  return promise.then(
    () => {
      throw new Error('Expected the request to reject.')
    },
    (error: CapturedError) => error,
  )
}

const BASE = 'https://api.example.test/api'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', BASE)
  vi.stubEnv('VITE_DEMO_MODE', '')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('API base URL resolution', () => {
  it('uses VITE_API_BASE_URL and trims trailing slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api///')
    expect(resolveApiBaseUrl()).toBe('https://api.example.test/api')
  })

  it('has no production fallback: a build without the variable gets no URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('DEV', false)
    expect(resolveApiBaseUrl()).toBeNull()
  })

  it('reports a configuration error instead of calling localhost when the URL is missing', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('DEV', false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/groups')).rejects.toBeInstanceOf(ConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('request handling against the existing response envelope', () => {
  it('unwraps { success: true, data } and sends a GET with query parameters', async () => {
    const mock = installMockApi([
      route('GET', '/api/groups/g1/expenses', (_p, url) => {
        expect(url.searchParams.get('categoryId')).toBe('c1')
        expect(url.searchParams.get('sort')).toBe('amount_desc')
        return success([{ id: 'e1' }])
      }),
    ])
    const result = await listExpenses('g1', { categoryId: 'c1', sort: 'amount_desc' })
    expect(result).toEqual([{ id: 'e1' }])
    expect(mock.calls[0].method).toBe('GET')
  })

  it('surfaces { success: false, error } as ApiRequestError with code and fields', async () => {
    installMockApi([
      route('POST', '/api/groups/g1/settlements', () =>
        failure(
          'INVALID_SETTLEMENT',
          'Settlement amount exceeds the sender’s outstanding debt of ₹500.',
          422,
        ),
      ),
    ])
    const error = await caught(
      createSettlement('g1', { from_person: 'a', to_person: 'b', amount: 900 }, 'pw'),
    )
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 422, code: 'INVALID_SETTLEMENT' })
    expect(error.message).toContain('₹500')
  })

  it('sends the admin password only in the X-Admin-Password header, never in the URL', async () => {
    const seen: { url: string; header: string | null }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        seen.push({
          url: String(input),
          header: new Headers(init?.headers).get('X-Admin-Password'),
        })
        return new Response(null, { status: 204 })
      }),
    )
    await deleteExpense('g1', 'e1', 'secret-pw')
    expect(seen[0].header).toBe('secret-pw')
    expect(seen[0].url).not.toContain('secret')
  })

  it('treats a 204 response as success with no body', async () => {
    installMockApi([
      route('DELETE', '/api/groups/g1/expenses/e1', () => ({ status: 204, body: null })),
    ])
    await expect(deleteExpense('g1', 'e1', 'pw')).resolves.toBeUndefined()
  })
})

describe('temporary unavailability', () => {
  it('reports an unreachable server as a NetworkError, without retrying on its own', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const error = await caught(apiRequest('/groups'))
    expect(error).toBeInstanceOf(NetworkError)
    expect(error.failure).toBe('unreachable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports the browser being offline as an offline failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const error = await caught(apiRequest('/groups'))
    expect(error.failure).toBe('offline')
  })

  it('times out a request that never answers, instead of spinning forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const pending = caught(apiRequest('/groups'))
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const error = await pending
    expect(error).toBeInstanceOf(NetworkError)
    expect(error.failure).toBe('timeout')
    expect(error.mutation).toBe(false)
  })

  it('marks a timed-out change as a mutation, because it may still have been saved', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const pending = caught(
      createSettlement('g1', { from_person: 'a', to_person: 'b', amount: 1 }, 'pw'),
    )
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const error = await pending
    expect(error).toBeInstanceOf(NetworkError)
    expect(error.mutation).toBe(true)
  })

  it('treats a non-JSON body (for example a proxy error page) as a communication failure for writes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    const error = await caught(apiRequest('/groups'))
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.code).toBe('INTERNAL_ERROR')
  })
})
