import { beforeEach, describe, expect, it } from 'vitest'
import type {
  BalancesResult,
  Category,
  Expense,
  Person,
  Settlement,
  SettlementSuggestion,
} from '../api/types.js'
import { answerQuestion, SUGGESTED_QUESTIONS, type AssistantContext } from './assistant.js'
import { DEMO_GROUP_IDS } from '../demo/demoData.js'
import { demoRequest } from '../demo/demoRouter.js'
import { resetDemoState } from '../demo/demoStore.js'

// Builds the assistant's context through the same demo API the dashboard
// uses, so these answers are checked against the real demo dataset.
async function contextFor(groupId: string): Promise<AssistantContext> {
  const [expenses, people, categories, balances, suggestions, settlements] = await Promise.all([
    demoRequest<Expense[]>({ method: 'GET', path: `/groups/${groupId}/expenses` }),
    demoRequest<Person[]>({
      method: 'GET',
      path: `/groups/${groupId}/people`,
      query: { includeInactive: 'true' },
    }),
    demoRequest<Category[]>({ method: 'GET', path: `/groups/${groupId}/categories` }),
    demoRequest<BalancesResult>({ method: 'GET', path: `/groups/${groupId}/balances` }),
    demoRequest<{ suggestions: SettlementSuggestion[] }>({
      method: 'GET',
      path: `/groups/${groupId}/settlements/suggestions`,
    }).then((r) => r.suggestions),
    demoRequest<Settlement[]>({ method: 'GET', path: `/groups/${groupId}/settlements` }),
  ])
  return { people, categories, expenses, balances, suggestions, settlements }
}

const GOA = DEMO_GROUP_IDS.goa

describe('demo assistant', () => {
  let context: AssistantContext

  beforeEach(async () => {
    resetDemoState()
    context = await contextFor(GOA)
  })

  it('supports every suggested question', () => {
    for (const question of SUGGESTED_QUESTIONS) {
      expect(answerQuestion(question, context).supported, question).toBe(true)
    }
  })

  it('answers total spending from the same dataset as the dashboard', () => {
    const reply = answerQuestion('How much have we spent in total?', context)
    expect(reply.text).toContain('₹93,650')
    expect(reply.text).toContain('14 expenses')
  })

  it('names the top payer and their amount', () => {
    expect(answerQuestion('Who paid the most?', context).text).toContain(
      'Ravi paid the most, ₹41,550',
    )
  })

  it('identifies the largest expense', () => {
    expect(answerQuestion("What's the largest expense?", context).text).toBe(
      'The largest expense is "Villa booking" at ₹36,000, paid by Ravi.',
    )
  })

  it('reports the highest category', () => {
    expect(answerQuestion('Which category did we spend the most on?', context).text).toContain(
      'Highest category: Rent, ₹36,000.',
    )
  })

  it('answers a single category when one is named', () => {
    expect(answerQuestion('How much went on Travel?', context).text).toContain('₹28,500')
  })

  it('answers a named month with its own total, not the whole period', () => {
    expect(answerQuestion('How much did we spend in September?', context).text).toContain(
      '₹2,540 across 3 expenses',
    )
  })

  it("reports a person's personal share, not what they paid", () => {
    const reply = answerQuestion("What is Asha's personal share?", context)
    expect(reply.text).toContain('₹23,817')
    expect(reply.text).toContain('not what they paid')
  })

  it('lists suggested payments that settle everyone', () => {
    const reply = answerQuestion('Who still owes whom?', context)
    expect(reply.text).toContain('₹22,566')
    expect(reply.text).toContain('Kabir pays Ravi ₹11,450')
    expect(reply.text).toContain('Meera pays Asha ₹3,183')
  })

  it('explains limits instead of guessing for unsupported topics', () => {
    const reply = answerQuestion('Will we stay under budget next month?', context)
    expect(reply.supported).toBe(false)
    expect(reply.text).toContain('no budgets, forecasts')
  })

  it('declines an unrelated question and lists what it can answer', () => {
    const reply = answerQuestion("What's the weather in Goa?", context)
    expect(reply.supported).toBe(false)
    expect(reply.text).toContain("I can't answer that")
  })

  it('asks for a question when the input is blank', () => {
    expect(answerQuestion('   ', context)).toEqual({
      supported: false,
      text: 'Type a question about this group, then send it.',
    })
  })
})
