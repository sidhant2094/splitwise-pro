import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { queryClient } from './App.js'
import { installMockApi, route, success } from './test/mockApi.js'

const GROUP_A = { id: 'group-a', name: 'Goa Trip', created_at: '' }
const GROUP_B = { id: 'group-b', name: 'Flat Expenses', created_at: '' }

function emptyGroupData(
  groupId: string,
  groupGetter: () => { id: string; name: string; created_at: string },
) {
  return [
    route('GET', `/groups/${groupId}`, () => success(groupGetter())),
    route('GET', `/groups/${groupId}/balances`, () =>
      success({ total_outstanding: 0, balances: [] }),
    ),
    route('GET', `/groups/${groupId}/categories`, () => success([])),
    route('GET', `/groups/${groupId}/people`, () => success([])),
    route('GET', `/groups/${groupId}/expenses`, () => success([])),
    route('GET', `/groups/${groupId}/settlements/suggestions`, () => success({ suggestions: [] })),
    route('GET', `/groups/${groupId}/settlements`, () => success([])),
  ]
}

beforeEach(() => {
  // BrowserRouter reads the real jsdom window.location, which (unlike
  // MemoryRouter) persists across tests in the same file — reset it so
  // navigation from a previous test doesn't leak into the next.
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  queryClient.clear()
})

describe('queryClient configuration', () => {
  it('does not disable window-focus refetching (React Query default applies)', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).not.toBe(false)
  })
})

describe('App navigation', () => {
  it('navigates to Settings and Settlement from the Home header', async () => {
    localStorage.setItem('splitwise-pro:current-group-id', 'group-a')
    installMockApi([
      route('GET', '/groups', () => success([GROUP_A])),
      ...emptyGroupData('group-a', () => GROUP_A),
    ])

    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Goa Trip')

    await user.click(screen.getByRole('button', { name: 'Group settings' }))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    // Wait for a Home-only control. Settings also shows the group name, so
    // waiting on the name alone can match the previous screen mid-navigation.
    await screen.findByRole('button', { name: 'Group settings' })

    await user.click(screen.getByRole('button', { name: 'Settlement' }))
    expect(await screen.findByText('Outstanding')).toBeInTheDocument()
  })

  it('switches groups and loads independent data, persisting the selection to localStorage', async () => {
    localStorage.setItem('splitwise-pro:current-group-id', 'group-a')
    installMockApi([
      route('GET', '/groups', () => success([GROUP_A, GROUP_B])),
      ...emptyGroupData('group-a', () => GROUP_A),
      ...emptyGroupData('group-b', () => GROUP_B),
    ])

    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Goa Trip')
    await user.click(screen.getByRole('button', { name: /Goa Trip/ }))
    await user.click(await screen.findByText('Flat Expenses'))

    await waitFor(() => expect(screen.getByText('Flat Expenses')).toBeInTheDocument())
    expect(localStorage.getItem('splitwise-pro:current-group-id')).toBe('group-b')
  })

  it('creates a new group from the empty state when none exist', async () => {
    let groups: (typeof GROUP_A)[] = []
    installMockApi([
      route('GET', '/groups', () => success(groups)),
      route('POST', '/groups', (_p, _u, init) => {
        const body = JSON.parse(init!.body as string)
        const group = { id: 'group-new', name: body.name, created_at: '' }
        groups = [group]
        return success(group, 201)
      }),
      ...emptyGroupData('group-new', () => groups[0]),
    ])

    render(<App />)
    const user = userEvent.setup()

    expect(await screen.findByText('No groups yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Create Group' }))
    await user.type(screen.getByLabelText('Group Name'), 'Manali Trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Manali Trip')).toBeInTheDocument()
  })
})
