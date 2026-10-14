import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { queryClient } from '../App.js'
import { resetDemoState } from './demoStore.js'
import { DEMO_GROUP_IDS } from './demoData.js'

// These tests run the real App in demo mode. No fetch should ever be made,
// because demo mode answers every request from the in-memory fixtures.

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  resetDemoState()
  localStorage.setItem('splitwise-pro:current-group-id', DEMO_GROUP_IDS.goa)
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  localStorage.clear()
  queryClient.clear()
})

describe('demo mode, end to end without a backend', () => {
  it('renders the home screen from demo data with no network calls and a visible demo banner', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<App />)

    expect(await screen.findByText('Goa Trip')).toBeInTheDocument()
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument()
    expect(await screen.findByText('Villa booking')).toBeInTheDocument()
    expect(screen.getAllByText('Kabir').length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('filters the transaction list by text search and shows an empty state when nothing matches', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Villa booking')
    const search = screen.getByRole('searchbox', { name: 'Search expenses' })

    await user.type(search, 'villa')
    expect(screen.getByText('Villa booking')).toBeInTheDocument()
    expect(screen.queryByText('Flights to Goa')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'zzz-no-match')
    expect(screen.getByText('No transactions match these filters.')).toBeInTheDocument()
  })

  it('shows dashboard totals derived from the same dataset, with paid, share and balance kept distinct', async () => {
    window.history.pushState({}, '', '/dashboard')
    render(<App />)

    expect(await screen.findByText('Total spent')).toBeInTheDocument()
    const summary = screen.getByRole('table', { name: 'Per-person totals' })
    const ravi = within(summary).getByText('Ravi').closest('[role="row"]') as HTMLElement
    expect(within(ravi).getByText('₹41,550')).toBeInTheDocument()
    expect(within(ravi).getByText('₹24,167')).toBeInTheDocument()
    expect(within(ravi).getByText('+₹19,383')).toBeInTheDocument()

    const hero = screen.getByRole('region', { name: 'Group total' })
    expect(within(hero).getByText('₹93,650')).toBeInTheDocument()
    expect(within(hero).getByText(/14 expenses · average ₹6,689/)).toBeInTheDocument()
  })

  it('opens the assistant from the sidebar, answers a suggested question, and handles an unsupported one', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Villa booking')
    await user.click(screen.getAllByRole('button', { name: 'Assistant' })[0])

    const dialog = await screen.findByRole('dialog', { name: 'Insights assistant' })
    await user.click(within(dialog).getByRole('button', { name: 'Who paid the most?' }))
    expect(await within(dialog).findByText(/Ravi paid the most, ₹41,550/)).toBeInTheDocument()

    const input = within(dialog).getByLabelText('Ask a question')
    const send = within(dialog).getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    await user.type(input, "What's the weather?")
    await user.click(send)
    expect(
      await within(dialog).findByText(/I can't answer that from this group's recorded data/),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Insights assistant' })).not.toBeInTheDocument(),
    )
  })
})
