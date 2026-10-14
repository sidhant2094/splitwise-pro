import type { BalanceEntry, Expense, Person } from '../api/types.js'

// Analytics derived from an expense list. Used by the dashboard and the
// assistant so both always agree. Everything is computed from the expenses
// the API returns (demo or live), and months are grouped by their UTC
// calendar month so results don't depend on the viewer's time zone.

export const UNCATEGORIZED = 'Uncategorized'

export interface CategoryTotal {
  name: string
  total: number
  count: number
}

export interface MonthTotal {
  key: string // YYYY-MM
  total: number
  count: number
}

export interface PersonTotals {
  person_id: string
  person_name: string
  paid: number // amount this person paid up front
  share: number // this person's portion of all expenses
  balance: number // from the ledger: positive = should receive
}

export interface ExpenseSummary {
  total: number
  count: number
  average: number
  largest: Expense | null
  categories: CategoryTotal[] // sorted by total, highest first
  months: MonthTotal[] // sorted chronologically
}

export function summarizeExpenses(expenses: Expense[]): ExpenseSummary {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const count = expenses.length

  let largest: Expense | null = null
  const categoryMap = new Map<string, CategoryTotal>()
  const monthMap = new Map<string, MonthTotal>()

  for (const expense of expenses) {
    if (!largest || expense.amount > largest.amount) largest = expense

    const categoryName = expense.category?.name ?? UNCATEGORIZED
    const category = categoryMap.get(categoryName) ?? { name: categoryName, total: 0, count: 0 }
    category.total += expense.amount
    category.count += 1
    categoryMap.set(categoryName, category)

    const key = monthKey(expense.created_at)
    const month = monthMap.get(key) ?? { key, total: 0, count: 0 }
    month.total += expense.amount
    month.count += 1
    monthMap.set(key, month)
  }

  return {
    total,
    count,
    average: count === 0 ? 0 : Math.round(total / count),
    largest,
    categories: [...categoryMap.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name),
    ),
    months: [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
  }
}

export function monthKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7)
}

// "2026-09" -> "Sep 2026", using UTC so it matches monthKey.
export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Per-person view that keeps the three figures distinct: what someone paid,
// what they consumed (their share), and the net amount still owed or due.
export function personTotals(
  expenses: Expense[],
  people: Person[],
  balances: BalanceEntry[],
): PersonTotals[] {
  const balanceById = new Map(balances.map((entry) => [entry.person_id, entry.balance]))

  return people.map((person) => {
    let paid = 0
    let share = 0
    for (const expense of expenses) {
      if (expense.paid_by.id === person.id) paid += expense.amount
      for (const s of expense.shares) {
        if (s.person_id === person.id) share += s.amount
      }
    }
    return {
      person_id: person.id,
      person_name: person.name,
      paid,
      share,
      balance: balanceById.get(person.id) ?? 0,
    }
  })
}
