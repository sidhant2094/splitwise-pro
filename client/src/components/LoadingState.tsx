import { useEffect, useState } from 'react'

const SLOW_HINT_AFTER_MS = 5000

interface LoadingStateProps {
  label?: string
}

// Shown while a request is in flight. After a few seconds it explains the
// likely cause (a free-tier server waking up), so a slow start reads as
// expected rather than broken. It never replaces the request with fake data.
export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="state-block state-block--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-block__body">{label}</p>
      {slow && (
        <p className="state-block__hint">
          Still waiting. The server can take up to a minute to wake up on free hosting.
        </p>
      )}
    </div>
  )
}
