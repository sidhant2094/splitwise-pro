import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { queryClient } from './App.js'
import { LoadingState } from './components/LoadingState.js'
import { installMockApi, route, success } from './test/mockApi.js'

// These tests drive the real App against mocked HTTP responses. They prove the
// frontend's behaviour (states, retry, shell, figures) but not the deployed
// integration, which needs the live API.

const GROUP = { id: 'group-a', name: 'Goa Trip', created_at: '' }
const ASHA = { id: 'p-asha', name: 'Asha', is_active: true, created_at: '' }
const RAVI = { id: 'p-ravi', name: 'Ravi', is_active: true, created_at: '' }

const EXPENSES = [
  {
    id: 'e1',
    description: 'Dinner',
    amount: 1000,
    paid_by: { id: ASHA.id, name: 'Asha' },
    category: { id: 'c-food', name: 'Food' },
    shares: [
      { person_id: ASHA.id, person_name: 'Asha', amount: 500 },
      { person_id: RAVI.id, person_name: 'Ravi', amount: 500 },
    ],
    created_at: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'e2',
    description: 'Taxi',
    amount: 300,
    paid_by: { id: RAVI.id, name: 'Ravi' },
    category: null,
    shares: [{ person_id: ASHA.id, person_name: 'Asha', amount: 300 }],
    created_at: '2026-09-05T10:00:00.000Z',
  },
]

function apiRoutes() {
  return [
    route('GET', '/groups', () => success([GROUP])),
    route('GET', '/groups/group-a', () => success(GROUP)),
    route('GET', '/groups/group-a/balances', () =>
      success({
        total_outstanding: 200,
        balances: [
          { person_id: ASHA.id, person_name: 'Asha', balance: 200 },
          { person_id: RAVI.id, person_name: 'Ravi', balance: -200 },
        ],
      }),
    ),
    route('GET', '/groups/group-a/categories', () =>
      success([{ id: 'c-food', name: 'Food', created_at: '' }]),
    ),
    route('GET', '/groups/group-a/people', () => success([ASHA, RAVI])),
    route('GET', '/groups/group-a/expenses', () => success(EXPENSES)),
    route('GET', '/groups/group-a/settlements/suggestions', () =>
      success({
        suggestions: [
          {
            from_person: { id: RAVI.id, name: 'Ravi' },
            to_person: { id: ASHA.id, name: 'Asha' },
            amount: 200,
          },
        ],
      }),
    ),
    route('GET', '/groups/group-a/settlements', () => success([])),
  ]
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', '')
  window.history.pushState({}, '', '/')
  localStorage.setItem('splitwise-pro:current-group-id', 'group-a')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
  queryClient.clear()
})

describe('backend unavailable', () => {
  it('keeps the app shell and navigation usable, shows a retry, then recovers on retry', async () => {
    const mock = installMockApi(apiRoutes())
    const realFetch = globalThis.fetch
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls += 1
        if (calls <= 1) throw new TypeError('Failed to fetch')
        return realFetch(input, init)
      }),
    )
    void mock

    render(<App />)
    const user = userEvent.setup()

    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
    expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument()
    // Navigation is still on screen while the content area shows the error.
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Assistant' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Goa Trip')).toBeInTheDocument()
    expect(screen.queryByText("Can't reach the server")).not.toBeInTheDocument()
  })

  it('shows a setup message with no retry when the build has no API URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('DEV', false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('Setup needed')).toBeInTheDocument()
    expect(screen.getByText(/VITE_API_BASE_URL/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('dashboard figures from API responses', () => {
  it('derives totals, categories and per-person amounts from the expenses and balances endpoints', async () => {
    installMockApi(apiRoutes())
    window.history.pushState({}, '', '/dashboard')

    render(<App />)

    const hero = await screen.findByRole('region', { name: 'Group total' })
    expect(within(hero).getByText('₹1,300')).toBeInTheDocument()
    expect(within(hero).getByText(/2 expenses · average ₹650/)).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Per-person totals' })
    const asha = within(table).getByText('Asha').closest('[role="row"]') as HTMLElement
    expect(within(asha).getByText('₹1,000')).toBeInTheDocument() // paid
    expect(within(asha).getByText('₹800')).toBeInTheDocument() // share
    expect(within(asha).getByText('+₹200')).toBeInTheDocument() // balance

    expect(screen.getByRole('img', { name: /Spending by category/ })).toBeInTheDocument()
  })

  it('shows an error panel with retry when the expenses request fails, instead of zeros', async () => {
    installMockApi(
      apiRoutes().map((r) =>
        r.match('/groups/group-a/expenses')
          ? route('GET', '/groups/group-a/expenses', () => ({
              status: 500,
              body: {
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
              },
            }))
          : r,
      ),
    )
    window.history.pushState({}, '', '/dashboard')

    render(<App />)

    // A 500 is retried once automatically, so allow for that delay.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Something went wrong',
    )
    expect(screen.queryByRole('region', { name: 'Group total' })).not.toBeInTheDocument()
    expect(screen.queryByText('₹0')).not.toBeInTheDocument()
  })
})

describe('loading state', () => {
  it('explains a slow cold start after a few seconds rather than spinning silently', () => {
    vi.useFakeTimers()
    render(<LoadingState label="Loading…" />)
    expect(screen.queryByText(/wake up/)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/can take up to a minute to wake up/)).toBeInTheDocument()
  })
})

describe('assistant', () => {
  it('answers from the group’s endpoint data and states that no AI model is connected', async () => {
    installMockApi(apiRoutes())
    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Goa Trip')
    await user.click(screen.getAllByRole('button', { name: 'Assistant' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Insights assistant' })

    expect(within(dialog).getByText(/No AI model is connected/)).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Who paid the most?' })).not.toBeDisabled(),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Who still owes whom?' }))
    expect(await within(dialog).findByText(/Ravi pays Asha ₹200/)).toBeInTheDocument()
  })
})
