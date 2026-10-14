import { beforeEach, describe, expect, it } from 'vitest'
import { ApiRequestError } from '../api/errors.js'
import { summarizeExpenses, personTotals } from '../insights/analytics.js'
import { createSeedState, DEMO_GROUP_IDS } from './demoData.js'
import { demoRequest } from './demoRouter.js'
import { DEMO_ADMIN_PASSWORD } from './mode.js'
import { getDemoState, resetDemoState } from './demoStore.js'
import { computeBalances, computeSettlementSuggestions } from './ledger.js'
import type { BalancesResult, Expense, Person } from '../api/types.js'

const GOA = DEMO_GROUP_IDS.goa
const FLAT = DEMO_GROUP_IDS.flat
const ASHA = 'demo-person-asha'
const RAVI = 'demo-person-ravi'
const MEERA = 'demo-person-meera'
const KABIR = 'demo-person-kabir'

async function getExpenses(groupId: string, query: Record<string, string> = {}) {
  return demoRequest<Expense[]>({
    method: 'GET',
    path: `/groups/${groupId}/expenses`,
    query,
  })
}

async function getBalances(groupId: string) {
  return demoRequest<BalancesResult>({ method: 'GET', path: `/groups/${groupId}/balances` })
}

async function getPeople(groupId: string) {
  return demoRequest<Person[]>({ method: 'GET', path: `/groups/${groupId}/people` })
}

beforeEach(() => {
  resetDemoState()
})

describe('demo fixtures and ledger (single source of truth)', () => {
  it('balances sum to zero and total_outstanding equals the positive balances', async () => {
    for (const groupId of [GOA, FLAT]) {
      const balances = await getBalances(groupId)
      const sum = balances.balances.reduce((total, entry) => total + entry.balance, 0)
      const positive = balances.balances
        .filter((entry) => entry.balance > 0)
        .reduce((total, entry) => total + entry.balance, 0)
      expect(sum).toBe(0)
      expect(balances.total_outstanding).toBe(positive)
    }
  })

  it('matches hand-computed Goa Trip balances, including the logged settlement', async () => {
    const { balances, total_outstanding } = await getBalances(GOA)
    const byId = Object.fromEntries(balances.map((b) => [b.person_id, b.balance]))

    // Paid: Asha 29,000, Ravi 41,550, Meera 11,800, Kabir 11,300.
    // Share: Asha 23,817, Ravi 24,167, Meera 22,916, Kabir 22,750.
    // Ravi -> Asha settlement of 2,000 moves Ravi +2,000 and Asha -2,000.
    expect(byId[ASHA]).toBe(3183)
    expect(byId[RAVI]).toBe(19383)
    expect(byId[MEERA]).toBe(-11116)
    expect(byId[KABIR]).toBe(-11450)
    expect(total_outstanding).toBe(22566)
  })

  it('computes deterministic suggestions in people order that settle every balance exactly', async () => {
    const { suggestions } = await demoRequest<{
      suggestions: { from_person: { id: string }; to_person: { id: string }; amount: number }[]
    }>({
      method: 'GET',
      path: `/groups/${GOA}/settlements/suggestions`,
    })

    // Same two-pointer order as server/src/business/smartSettlement.ts:
    // creditors and debtors keep the people creation order (Asha, Ravi, Meera, Kabir).
    expect(suggestions).toEqual([
      expect.objectContaining({
        amount: 3183,
        from_person: expect.objectContaining({ id: MEERA }),
        to_person: expect.objectContaining({ id: ASHA }),
      }),
      expect.objectContaining({
        amount: 7933,
        from_person: expect.objectContaining({ id: MEERA }),
        to_person: expect.objectContaining({ id: RAVI }),
      }),
      expect.objectContaining({
        amount: 11450,
        from_person: expect.objectContaining({ id: KABIR }),
        to_person: expect.objectContaining({ id: RAVI }),
      }),
    ])

    // Applying the suggestions to the balances must leave everyone at zero.
    const { balances } = await getBalances(GOA)
    const remaining = new Map(balances.map((b) => [b.person_id, b.balance]))
    for (const s of suggestions) {
      remaining.set(s.from_person.id, (remaining.get(s.from_person.id) ?? 0) + s.amount)
      remaining.set(s.to_person.id, (remaining.get(s.to_person.id) ?? 0) - s.amount)
    }
    for (const value of remaining.values()) expect(value).toBe(0)
  })

  it('keeps amount paid, personal share and balance distinct, and each column totals the spend', () => {
    const state = createSeedState()
    const goaExpenses = state.expenses.filter((e) => e.group_id === GOA)
    const goaPeople = state.people.filter((p) => p.group_id === GOA)
    const expenses: Expense[] = goaExpenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: e.amount,
      paid_by: { id: e.paid_by, name: goaPeople.find((p) => p.id === e.paid_by)!.name },
      category: null,
      shares: e.shares.map((s) => ({
        person_id: s.person_id,
        person_name: goaPeople.find((p) => p.id === s.person_id)!.name,
        amount: s.amount,
      })),
      created_at: e.created_at,
    }))
    const balances = computeBalances({
      people: goaPeople,
      expenses: goaExpenses,
      settlements: state.settlements.filter((s) => s.group_id === GOA),
    })
    const totals = personTotals(expenses, goaPeople, balances.balances)
    const total = summarizeExpenses(expenses).total

    expect(totals.reduce((sum, t) => sum + t.paid, 0)).toBe(total)
    expect(totals.reduce((sum, t) => sum + t.share, 0)).toBe(total)
    expect(totals.find((t) => t.person_id === ASHA)).toEqual({
      person_id: ASHA,
      person_name: 'Asha',
      paid: 29000,
      share: 23817,
      balance: 3183,
    })
  })

  it('splits remainders by the first participants in selection order', async () => {
    const expenses = await getExpenses(GOA)
    const lunch = expenses.find((e) => e.description === 'Beach shack lunch')!
    expect(lunch.shares.map((s) => [s.person_name, s.amount])).toEqual([
      ['Asha', 917],
      ['Ravi', 917],
      ['Meera', 916],
    ])
  })
})

describe('demo router', () => {
  it('keeps groups isolated: Flat Expenses has its own people and balances', async () => {
    const people = await getPeople(FLAT)
    expect(people.map((p) => p.name).sort()).toEqual(['Dev', 'Priya'])
    const { balances } = await getBalances(FLAT)
    expect(balances.find((b) => b.person_name === 'Priya')?.balance).toBe(14725)
    expect(balances.find((b) => b.person_name === 'Dev')?.balance).toBe(-14725)
  })

  it('filters expenses by category, person, date range and sort order', async () => {
    const travel = await getExpenses(GOA, { categoryId: 'demo-cat-travel' })
    expect(travel.map((e) => e.description).sort()).toEqual(
      ['Cab from Mapusa', 'Flights to Goa', 'Scooter rental', 'Taxi to the airport'].sort(),
    )

    const kabirInvolved = await getExpenses(GOA, { personId: KABIR })
    expect(
      kabirInvolved.every(
        (e) => e.paid_by.id === KABIR || e.shares.some((s) => s.person_id === KABIR),
      ),
    ).toBe(true)

    const september = await getExpenses(GOA, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    })
    expect(september.map((e) => e.description).sort()).toEqual(
      ['Cab from Mapusa', 'Ice cream run', 'Movie night'].sort(),
    )

    const cheapestFirst = await getExpenses(GOA, { sort: 'amount_asc' })
    expect(cheapestFirst[0].amount).toBe(640)
    const newestFirst = await getExpenses(GOA, { sort: 'newest' })
    expect(newestFirst[0].description).toBe('Movie night')
  })

  it('creates an expense and reflects it in balances and totals', async () => {
    const before = await getBalances(GOA)
    const created = await demoRequest<Expense>({
      method: 'POST',
      path: `/groups/${GOA}/expenses`,
      body: {
        description: 'Coconut water',
        amount: 300,
        paid_by: ASHA,
        category_id: 'demo-cat-food',
        shares: [
          { person_id: ASHA, amount: 150 },
          { person_id: RAVI, amount: 150 },
        ],
      },
    })
    expect(created.description).toBe('Coconut water')

    const after = await getBalances(GOA)
    const asha = (b: BalancesResult) => b.balances.find((e) => e.person_id === ASHA)!.balance
    const ravi = (b: BalancesResult) => b.balances.find((e) => e.person_id === RAVI)!.balance
    // Asha paid 300 and owes 150; Ravi owes 150.
    expect(asha(after)).toBe(asha(before) + 150)
    expect(ravi(after)).toBe(ravi(before) - 150)
    expect(after.balances.reduce((sum, e) => sum + e.balance, 0)).toBe(0)
  })

  it('rejects an expense whose shares do not add up to the amount', async () => {
    const attempt = demoRequest({
      method: 'POST',
      path: `/groups/${GOA}/expenses`,
      body: {
        description: 'Bad split',
        amount: 100,
        paid_by: ASHA,
        category_id: null,
        shares: [{ person_id: ASHA, amount: 60 }],
      },
    })
    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError)
    await expect(attempt).rejects.toMatchObject({ status: 422, code: 'INVALID_EXPENSE_SHARES' })
    expect(getDemoState().expenses.some((e) => e.description === 'Bad split')).toBe(false)
  })

  it('requires the demo admin password for destructive and money-moving actions', async () => {
    await expect(
      demoRequest({ method: 'DELETE', path: `/groups/${GOA}/expenses/demo-exp-01` }),
    ).rejects.toMatchObject({ code: 'ADMIN_PASSWORD_REQUIRED' })

    await expect(
      demoRequest({
        method: 'DELETE',
        path: `/groups/${GOA}/expenses/demo-exp-01`,
        adminPassword: 'not-the-password',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ADMIN_PASSWORD' })

    await demoRequest({
      method: 'DELETE',
      path: `/groups/${GOA}/expenses/demo-exp-01`,
      adminPassword: DEMO_ADMIN_PASSWORD,
    })
    expect(getDemoState().expenses.some((e) => e.id === 'demo-exp-01')).toBe(false)
  })

  it('logs a settlement and moves the balances accordingly', async () => {
    await demoRequest({
      method: 'POST',
      path: `/groups/${GOA}/settlements`,
      adminPassword: DEMO_ADMIN_PASSWORD,
      body: { from_person: KABIR, to_person: RAVI, amount: 11450 },
    })
    const { balances } = await getBalances(GOA)
    expect(balances.find((b) => b.person_id === KABIR)?.balance).toBe(0)
    expect(balances.find((b) => b.person_id === RAVI)?.balance).toBe(19383 - 11450)
  })

  it('answers unknown routes with a not-found error rather than a fake success', async () => {
    await expect(
      demoRequest({ method: 'GET', path: '/groups/nope/expenses' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('computes settlement suggestions from any balance list', () => {
    const suggestions = computeSettlementSuggestions([
      { person_id: 'a', person_name: 'A', balance: 500 },
      { person_id: 'b', person_name: 'B', balance: -200 },
      { person_id: 'c', person_name: 'C', balance: -300 },
    ])
    // Input order is kept: B (first debtor) settles first, then C.
    expect(suggestions.map((s) => s.amount)).toEqual([200, 300])
  })
})
