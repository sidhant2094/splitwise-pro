import { isDemoMode } from '../demo/mode.js'
import { ApiRequestError, ConfigurationError, NetworkError } from './errors.js'

export { ApiRequestError, ConfigurationError, NetworkError }

// Long enough to ride out a Render free-tier cold start (roughly 30-60s
// worst case), short enough that the UI never spins indefinitely.
export const REQUEST_TIMEOUT_MS = 60_000

// VITE_API_BASE_URL is the existing convention (see client/.env.example and
// render.yaml): the full API base including `/api`, e.g.
// https://splitwise-pro-server.onrender.com/api. It is public by design, since
// the browser must call it. Development falls back to the local API port
// only; a production build without it reports a configuration error instead
// of guessing an address.
export function resolveApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return import.meta.env.DEV ? 'http://localhost:4000/api' : null
}

interface ApiSuccessBody<T> {
  success: true
  data: T
}

interface ApiErrorBody {
  success: false
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | undefined>
  adminPassword?: string
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(`${baseUrl}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, adminPassword } = options

  // Demo mode answers from the in-memory fixtures instead of the network.
  // It is selected at build/dev time by VITE_DEMO_MODE, so the live client
  // path below is unchanged when demo mode is off.
  // The demo router is loaded only in demo mode, so its fixtures are kept out
  // of the code path (and the initial bundle) of a normal build.
  if (isDemoMode()) {
    const { demoRequest } = await import('../demo/demoRouter.js')
    return demoRequest<T>({ method, path, query, body, adminPassword })
  }

  const baseUrl = resolveApiBaseUrl()
  if (!baseUrl) {
    throw new ConfigurationError()
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (adminPassword) {
    headers['X-Admin-Password'] = adminPassword
  }

  const isMutation = method !== 'GET'
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(buildUrl(baseUrl, path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch {
      throw new NetworkError(classifyFailure(timedOut), isMutation)
    }

    if (response.status === 204) {
      return undefined as T
    }

    let parsed: ApiSuccessBody<T> | ApiErrorBody
    try {
      parsed = await response.json()
    } catch {
      // A body that cannot be parsed (for example, a proxy error page while
      // the server restarts) is not a business error, so treat it as a
      // communication failure rather than showing a fake server message.
      if (timedOut) throw new NetworkError('timeout', isMutation)
      throw new ApiRequestError(response.status, 'INTERNAL_ERROR', 'Something went wrong.')
    }

    if (!parsed.success) {
      throw new ApiRequestError(
        response.status,
        parsed.error.code,
        parsed.error.message,
        parsed.error.fields,
      )
    }

    return parsed.data
  } finally {
    clearTimeout(timer)
  }
}

function classifyFailure(timedOut: boolean): 'timeout' | 'offline' | 'unreachable' {
  if (timedOut) return 'timeout'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  return 'unreachable'
}

export function get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', query })
}

export function post<T>(path: string, body?: unknown, adminPassword?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, adminPassword })
}

export function patch<T>(path: string, body?: unknown, adminPassword?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body, adminPassword })
}

export function del<T>(path: string, adminPassword?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', adminPassword })
}
