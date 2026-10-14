import type { BalanceEntry, BalancesResult, SettlementSuggestion } from '../api/types.js'
import type { DemoExpense, DemoPerson, DemoSettlement } from './demoData.js'

// Demo ledger. It mirrors server/src/business/balances.ts and
// server/src/business/smartSettlement.ts so demo figures match what the real
// API returns for the same data:
//   - balance[payer] += amount, balance[participant] -= share,
//     balance[sender] += amount, balance[receiver] -= amount.
//   - A removed (inactive) person's balance is redistributed across the
//     currently active people, and only active people are returned.
//   - Settlement suggestions use the two-pointer greedy match over the input
//     order (people creation order), not a sorted order.
// Balances always sum to zero, which the tests assert.

export interface LedgerInput {
  people: DemoPerson[]
  expenses: DemoExpense[]
  settlements: DemoSettlement[]
}

// Split `total` across `count` people: integer division, with the remainder
// going to the first participants in order. Mirrors server/src/business/split.ts.
function distributeEqually(total: number, count: number): number[] {
  if (count <= 0) return []
  const sign = total < 0 ? -1 : 1
  const magnitude = Math.abs(total)
  const base = Math.floor(magnitude / count)
  const remainder = magnitude % count
  return Array.from({ length: count }, (_, index) => sign * (base + (index < remainder ? 1 : 0)))
}

export function computeBalances({ people, expenses, settlements }: LedgerInput): BalancesResult {
  const raw = new Map<string, number>(people.map((person) => [person.id, 0]))

  for (const expense of expenses) {
    raw.set(expense.paid_by, (raw.get(expense.paid_by) ?? 0) + expense.amount)
    for (const share of expense.shares) {
      raw.set(share.person_id, (raw.get(share.person_id) ?? 0) - share.amount)
    }
  }

  for (const settlement of settlements) {
    raw.set(settlement.from_person, (raw.get(settlement.from_person) ?? 0) + settlement.amount)
    raw.set(settlement.to_person, (raw.get(settlement.to_person) ?? 0) - settlement.amount)
  }

  // Removal redistribution: each inactive person's raw balance is spread over
  // the active people, so the active balances still sum to zero.
  const activeIds = people.filter((p) => p.is_active).map((p) => p.id)
  const adjusted = new Map<string, number>(activeIds.map((id) => [id, raw.get(id) ?? 0]))
  if (activeIds.length > 0) {
    for (const inactive of people.filter((p) => !p.is_active)) {
      const deltas = distributeEqually(raw.get(inactive.id) ?? 0, activeIds.length)
      activeIds.forEach((id, index) => {
        adjusted.set(id, (adjusted.get(id) ?? 0) + deltas[index])
      })
    }
  }

  const balances: BalanceEntry[] = people
    .filter((person) => person.is_active)
    .map((person) => ({
      person_id: person.id,
      person_name: person.name,
      balance: adjusted.get(person.id) ?? 0,
    }))

  const totalOutstanding = balances
    .filter((entry) => entry.balance > 0)
    .reduce((sum, entry) => sum + entry.balance, 0)

  return { total_outstanding: totalOutstanding, balances }
}

// Two-pointer greedy match, in input order, as in the server's
// computeSmartSettlement. Each step settles the smaller of the two remaining
// amounts, and whichever side reaches zero advances.
export function computeSettlementSuggestions(balances: BalanceEntry[]): SettlementSuggestion[] {
  const creditors = balances
    .filter((entry) => entry.balance > 0)
    .map((entry) => ({ id: entry.person_id, name: entry.person_name, remaining: entry.balance }))
  const debtors = balances
    .filter((entry) => entry.balance < 0)
    .map((entry) => ({ id: entry.person_id, name: entry.person_name, remaining: -entry.balance }))

  const suggestions: SettlementSuggestion[] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]
    const creditor = creditors[c]
    const payment = Math.min(debtor.remaining, creditor.remaining)

    if (payment > 0) {
      suggestions.push({
        from_person: { id: debtor.id, name: debtor.name },
        to_person: { id: creditor.id, name: creditor.name },
        amount: payment,
      })
    }

    debtor.remaining -= payment
    creditor.remaining -= payment
    if (debtor.remaining === 0) d += 1
    if (creditor.remaining === 0) c += 1
  }

  return suggestions
}
