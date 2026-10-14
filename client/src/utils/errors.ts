import { ApiRequestError, ConfigurationError, NetworkError } from '../api/client.js'

// UI_UX_Specification.md §42: errors should be short and actionable, and
// must never leak technical/database internals — the backend already
// guarantees that for its `message`, so most codes can surface it directly.
export function getErrorMessage(error: unknown): string {
  if (error instanceof ConfigurationError) {
    return error.message
  }

  if (error instanceof NetworkError) {
    // A timed-out change may already be saved. Never tell the user it failed
    // when we do not know that.
    if (error.mutation && error.failure === 'timeout') {
      return 'The server did not confirm this change in time, so it may or may not have been saved. Check before trying again.'
    }
    return error.message
  }

  if (error instanceof ApiRequestError) {
    if (error.code === 'INVALID_ADMIN_PASSWORD') {
      return 'Incorrect admin password.'
    }
    if (error.code === 'ADMIN_PASSWORD_REQUIRED') {
      return 'Admin password is required for this action.'
    }
    if (error.code === 'RATE_LIMITED') {
      return 'Too many attempts. Please try again later.'
    }
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export function getFieldErrors(error: unknown): Record<string, string> | undefined {
  if (error instanceof ApiRequestError) {
    return error.fields
  }
  return undefined
}

// Whether a retry is likely to help. Used to decide whether to offer a retry
// button for a failed read, and to avoid automatic retries for failures that
// retrying cannot fix (configuration, rejected input).
export function isRetryableError(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof ApiRequestError && error.status >= 500)
}
