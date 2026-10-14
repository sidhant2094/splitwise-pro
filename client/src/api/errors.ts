export class ApiRequestError extends Error {
  code: string
  status: number
  fields?: Record<string, string>

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export type NetworkFailure = 'unreachable' | 'timeout' | 'offline'

// Thrown when the request never produced a structured API response: the
// server was unreachable, the browser was offline, or the server did not
// answer in time (typical while a free Render web service wakes up).
//
// `mutation` marks requests that change data. For those, a timeout does not
// tell us whether the change was saved, so the message must say so instead of
// implying it failed.
export class NetworkError extends Error {
  readonly failure: NetworkFailure
  readonly mutation: boolean

  constructor(failure: NetworkFailure = 'unreachable', mutation = false) {
    super(
      failure === 'timeout'
        ? 'The server did not respond in time. Free hosting can take about a minute to wake up.'
        : failure === 'offline'
          ? 'You appear to be offline. Check your connection and try again.'
          : 'Could not reach the server. Check your connection and try again.',
    )
    this.name = 'NetworkError'
    this.failure = failure
    this.mutation = mutation
  }
}

// Thrown before any request is made when this build has no API URL. Production
// builds must set VITE_API_BASE_URL; there is deliberately no localhost
// fallback outside development.
export class ConfigurationError extends Error {
  constructor() {
    super('The app is not connected to its server. This build is missing VITE_API_BASE_URL.')
    this.name = 'ConfigurationError'
  }
}
