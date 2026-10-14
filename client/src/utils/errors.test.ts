import { describe, expect, it } from 'vitest'
import { ApiRequestError, ConfigurationError, NetworkError } from '../api/errors.js'
import { getErrorMessage, isRetryableError } from './errors.js'

describe('getErrorMessage', () => {
  it('never tells the user a timed-out change failed when it may have been saved', () => {
    const message = getErrorMessage(new NetworkError('timeout', true))
    expect(message).toMatch(/may or may not have been saved/)
    expect(message).not.toMatch(/failed/i)
  })

  it('explains a slow cold start for reads', () => {
    expect(getErrorMessage(new NetworkError('timeout', false))).toMatch(/wake up/)
  })

  it('shows the server message for business errors, unchanged', () => {
    expect(getErrorMessage(new ApiRequestError(422, 'INVALID_SETTLEMENT', 'Too much.'))).toBe(
      'Too much.',
    )
  })

  it('maps the admin password codes to plain language', () => {
    expect(getErrorMessage(new ApiRequestError(401, 'INVALID_ADMIN_PASSWORD', 'x'))).toBe(
      'Incorrect admin password.',
    )
  })

  it('names the missing build setting for a configuration error', () => {
    expect(getErrorMessage(new ConfigurationError())).toMatch(/VITE_API_BASE_URL/)
  })
})

describe('isRetryableError', () => {
  it('allows retrying a server error or an unreachable server', () => {
    expect(isRetryableError(new NetworkError('unreachable'))).toBe(true)
    expect(isRetryableError(new ApiRequestError(503, 'INTERNAL_ERROR', 'x'))).toBe(true)
  })

  it('does not offer a retry that cannot succeed', () => {
    expect(isRetryableError(new ConfigurationError())).toBe(false)
    expect(isRetryableError(new ApiRequestError(422, 'INVALID_SETTLEMENT', 'x'))).toBe(false)
  })
})
