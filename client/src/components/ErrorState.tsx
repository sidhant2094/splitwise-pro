import { ConfigurationError, NetworkError } from '../api/errors.js'
import { getErrorMessage } from '../utils/errors.js'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  retryLabel?: string
}

// Non-blocking error panel. It renders inside the app shell, so navigation
// stays usable while the server is unreachable.
export function ErrorState({ error, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  const title =
    error instanceof NetworkError
      ? "Can't reach the server"
      : error instanceof ConfigurationError
        ? 'Setup needed'
        : 'Something went wrong'

  return (
    <div className="state-block state-block--error" role="alert">
      <p className="state-block__title">{title}</p>
      <p className="state-block__body">{getErrorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          className="button button--secondary state-block__action"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
