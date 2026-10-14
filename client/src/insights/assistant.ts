import type {
  BalancesResult,
  Category,
  Expense,
  Person,
  SettlementSuggestion,
  Settlement,
} from '../api/types.js'
import { formatRupees } from '../utils/format.js'
import { formatMonthKey, monthKey, personTotals, summarizeExpenses } from './analytics.js'

// Insights assistant. It is a deterministic keyword matcher over the
// dataset, not a language model: it answers only the question types listed in
// SUPPORTED_TOPICS, and says so plainly for anything else. Every number it
// prints is computed from the same expenses, balances and settlements the
// dashboard shows.

export interface AssistantContext {
  people: Person[]
  categories: Category[]
  expenses: Expense[]
  balances: BalancesResult
  suggestions: SettlementSuggestion[]
  settlements: Settlement[]
}

export interface AssistantReply {
  text: string
  supported: boolean
}

export const SUGGESTED_QUESTIONS: string[] = [
  'How much have we spent in total?',
  'Which category did we spend the most on?',
  'Who paid the most?',
  "What's the largest expense?",
  'Who still owes whom?',
  'How much did we spend in September?',
  "What is Asha's personal share?",
]

export const SUPPORTED_TOPICS = [
  'total spending and expense count',
  'average expense size',
  'the largest expense',
  'spending by category, including one category at a time',
  'spending by month, including a named month',
  'who paid the most, and how much a person paid',
  "a person's personal share of expenses",
  'outstanding balances and suggested settlements',
  'the logged settlement history',
]

const UNSUPPORTED_TOPIC_WORDS = [
  'budget',
  'forecast',
  'predict',
  'currency',
  'convert',
  'dollar',
  'usd',
  'tax',
  'invoice',
]

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function findNamed<T extends { name: string }>(text: string, items: T[]): T | undefined {
  // Prefer the longest matching name so "Flat Expenses" beats "Flat".
  return [...items]
    .filter((item) => text.includes(item.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0]
}

function findMonthNumber(text: string): number | undefined {
  const index = MONTH_NAMES.findIndex((name) => text.includes(name))
  return index === -1 ? undefined : index + 1
}

function latestMonthKey(expenses: Expense[]): string | undefined {
  return expenses
    .map((e) => monthKey(e.created_at))
    .sort()
    .at(-1)
}

export function answerQuestion(question: string, context: AssistantContext): AssistantReply {
  const text = question.trim().toLowerCase()
  if (!text) {
    return { supported: false, text: 'Type a question about this group, then send it.' }
  }

  if (includesAny(text, UNSUPPORTED_TOPIC_WORDS)) {
    return unsupported(
      'This group has no budgets, forecasts, tax details or currency rates recorded, so I cannot answer that.',
    )
  }

  const { expenses, people, categories, balances, suggestions, settlements } = context
  const summary = summarizeExpenses(expenses)
  const person = findNamed(text, people)
  const category = findNamed(text, categories)

  if (expenses.length === 0 && !includesAny(text, ['settle', 'owe', 'balance', 'logged'])) {
    return { supported: true, text: 'No expenses are recorded in this group yet.' }
  }

  if (includesAny(text, ['settlement', 'logged'])) {
    if (settlements.length === 0) {
      return { supported: true, text: 'No settlements have been logged in this group yet.' }
    }
    const total = settlements.reduce((sum, s) => sum + s.amount, 0)
    const lines = [...settlements]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(
        (s) =>
          `${s.from_person.name} paid ${s.to_person.name} ${formatRupees(s.amount)} (${formatMonthKey(monthKey(s.created_at))}).`,
      )
    return {
      supported: true,
      text: `${settlements.length} settlement${settlements.length === 1 ? '' : 's'} logged, totalling ${formatRupees(total)}.\n${lines.join('\n')}`,
    }
  }

  if (includesAny(text, ['largest', 'biggest', 'most expensive', 'highest', 'top expense'])) {
    const largest = summary.largest
    if (!largest) return { supported: true, text: 'No expenses are recorded yet.' }
    return {
      supported: true,
      text: `The largest expense is "${largest.description}" at ${formatRupees(largest.amount)}, paid by ${largest.paid_by.name}.`,
    }
  }

  if (includesAny(text, ['average', 'avg', 'typical expense', 'mean'])) {
    return {
      supported: true,
      text: `The average expense is ${formatRupees(summary.average)} across ${summary.count} expenses.`,
    }
  }

  if (includesAny(text, ['how many', 'number of', 'count'])) {
    return {
      supported: true,
      text: `There ${summary.count === 1 ? 'is' : 'are'} ${summary.count} expense${summary.count === 1 ? '' : 's'} recorded.`,
    }
  }

  if (
    includesAny(text, [
      'owe',
      'owes',
      'outstanding',
      'balance',
      'settle up',
      'who pays',
      'pay back',
      'settle',
    ])
  ) {
    return owesReply(person, balances, suggestions)
  }

  const monthNumber = findMonthNumber(text)
  if (monthNumber !== undefined || includesAny(text, ['month', 'monthly'])) {
    return monthReply(text, monthNumber, expenses, summary)
  }

  if (category && includesAny(text, ['spend', 'spent', 'cost', 'how much', 'total'])) {
    const match = summary.categories.find((c) => c.name === category.name)
    if (!match) {
      return {
        supported: true,
        text: `Nothing has been spent on ${category.name} yet.`,
      }
    }
    const share = Math.round((match.total / summary.total) * 100)
    return {
      supported: true,
      text: `${category.name} totals ${formatRupees(match.total)} across ${match.count} expense${match.count === 1 ? '' : 's'}, about ${share}% of all spending.`,
    }
  }

  if (includesAny(text, ['categor', 'breakdown', 'where did', 'where does'])) {
    if (summary.categories.length === 0) {
      return { supported: true, text: 'No category spending to show yet.' }
    }
    const lines = summary.categories.map(
      (c) => `${c.name}: ${formatRupees(c.total)} (${c.count} expense${c.count === 1 ? '' : 's'})`,
    )
    const top = summary.categories[0]
    return {
      supported: true,
      text: `Highest category: ${top.name}, ${formatRupees(top.total)}.\n${lines.join('\n')}`,
    }
  }

  if (person && includesAny(text, ['share', 'personal', 'consumed', 'fair'])) {
    const totals = personTotals(expenses, people, balances.balances).find(
      (t) => t.person_id === person.id,
    )
    return {
      supported: true,
      text: `${person.name}'s personal share across all expenses is ${formatRupees(totals?.share ?? 0)}. This is what ${person.name} consumed, not what they paid.`,
    }
  }

  if (person && includesAny(text, ['paid', 'spent', 'pay'])) {
    const totals = personTotals(expenses, people, balances.balances).find(
      (t) => t.person_id === person.id,
    )
    return {
      supported: true,
      text: `${person.name} paid ${formatRupees(totals?.paid ?? 0)} up front across all expenses.`,
    }
  }

  if (
    includesAny(text, ['paid the most', 'who paid', 'top payer', 'most paid', 'payer', 'paid most'])
  ) {
    const ranking = personTotals(expenses, people, balances.balances)
      .filter((t) => t.paid > 0)
      .sort((a, b) => b.paid - a.paid || a.person_name.localeCompare(b.person_name))
    if (ranking.length === 0)
      return { supported: true, text: 'Nobody has paid for an expense yet.' }
    return {
      supported: true,
      text: `${ranking[0].person_name} paid the most, ${formatRupees(ranking[0].paid)} in total.\n${ranking
        .map((t) => `${t.person_name}: ${formatRupees(t.paid)}`)
        .join('\n')}`,
    }
  }

  if (includesAny(text, ['total', 'spent', 'spend', 'how much', 'overall', 'altogether'])) {
    return {
      supported: true,
      text: `The group has spent ${formatRupees(summary.total)} across ${summary.count} expenses.`,
    }
  }

  return unsupported()
}

function unsupported(prefix?: string): AssistantReply {
  const intro = prefix ? `${prefix} ` : "I can't answer that from this group's recorded data. "
  return {
    supported: false,
    text: `${intro}I can answer questions about: ${SUPPORTED_TOPICS.join('; ')}.`,
  }
}

function owesReply(
  person: Person | undefined,
  balances: BalancesResult,
  suggestions: SettlementSuggestion[],
): AssistantReply {
  if (balances.balances.every((entry) => entry.balance === 0)) {
    return { supported: true, text: 'Everyone is settled up. No payments are outstanding.' }
  }

  if (person) {
    const entry = balances.balances.find((b) => b.person_id === person.id)
    const balance = entry?.balance ?? 0
    const mine = suggestions.filter(
      (s) => s.from_person.id === person.id || s.to_person.id === person.id,
    )
    const direction =
      balance > 0
        ? `should receive ${formatRupees(balance)} overall`
        : balance < 0
          ? `owes ${formatRupees(-balance)} overall`
          : 'is settled up'
    const detail = mine.length
      ? mine
          .map((s) => `${s.from_person.name} pays ${s.to_person.name} ${formatRupees(s.amount)}`)
          .join('; ')
      : 'No suggested payments involve this person.'
    return { supported: true, text: `${person.name} ${direction}. ${detail}.` }
  }

  if (suggestions.length === 0) {
    return { supported: true, text: 'Everyone is settled up. No payments are outstanding.' }
  }
  const lines = suggestions.map(
    (s) => `${s.from_person.name} pays ${s.to_person.name} ${formatRupees(s.amount)}`,
  )
  return {
    supported: true,
    text: `Outstanding: ${formatRupees(balances.total_outstanding)}. Suggested payments that settle everyone:\n${lines.join('\n')}`,
  }
}

function monthReply(
  text: string,
  monthNumber: number | undefined,
  expenses: Expense[],
  summary: ReturnType<typeof summarizeExpenses>,
): AssistantReply {
  const useLatest = includesAny(text, ['this month', 'last month', 'latest'])
  const targetMonth = useLatest ? latestMonthKey(expenses) : undefined

  if (monthNumber !== undefined) {
    const matching = summary.months.filter((m) => Number(m.key.slice(5, 7)) === monthNumber)
    if (matching.length === 0) {
      return {
        supported: true,
        text: `No expenses are recorded for ${MONTH_NAMES[monthNumber - 1].replace(/^./, (c) => c.toUpperCase())}.`,
      }
    }
    const total = matching.reduce((sum, m) => sum + m.total, 0)
    const count = matching.reduce((sum, m) => sum + m.count, 0)
    const label = matching.map((m) => formatMonthKey(m.key)).join(', ')
    return {
      supported: true,
      text: `${label}: ${formatRupees(total)} across ${count} expense${count === 1 ? '' : 's'}.`,
    }
  }

  if (targetMonth) {
    const month = summary.months.find((m) => m.key === targetMonth)
    return {
      supported: true,
      text: `The latest month in this group's data is ${formatMonthKey(targetMonth)}: ${formatRupees(month?.total ?? 0)} across ${month?.count ?? 0} expenses.`,
    }
  }

  if (summary.months.length === 0)
    return { supported: true, text: 'No monthly spending to show yet.' }
  const lines = summary.months.map(
    (m) =>
      `${formatMonthKey(m.key)}: ${formatRupees(m.total)} (${m.count} expense${m.count === 1 ? '' : 's'})`,
  )
  return { supported: true, text: lines.join('\n') }
}
