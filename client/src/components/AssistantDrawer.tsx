import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ErrorState } from './ErrorState.js'
import { LoadingState } from './LoadingState.js'
import { useCurrentGroup } from '../context/GroupContext.js'
import { useBalancesQuery } from '../hooks/useBalances.js'
import { useCategoriesQuery } from '../hooks/useCategories.js'
import { useExpensesQuery } from '../hooks/useExpenses.js'
import { usePeopleQuery } from '../hooks/usePeople.js'
import {
  useSettlementHistoryQuery,
  useSettlementSuggestionsQuery,
} from '../hooks/useSettlements.js'
import { isDemoMode } from '../demo/mode.js'
import { answerQuestion, SUGGESTED_QUESTIONS } from '../insights/assistant.js'

const MAX_QUESTION_LENGTH = 200

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  supported?: boolean
}

const GREETING: Message = {
  id: 0,
  role: 'assistant',
  text: 'Ask about totals, categories, months, payers, balances or settlements for this group.',
}

interface AssistantDrawerProps {
  onClose: () => void
}

// Left-side assistant panel. It is deliberately not an AI model: answers come
// from a fixed set of rules applied to this group's expenses, people,
// categories, balances, suggested settlements and settlement history, all read
// from existing API endpoints. Questions outside that set are declined with an
// explanation.
export function AssistantDrawer({ onClose }: AssistantDrawerProps) {
  const { currentGroupId } = useCurrentGroup()
  const expensesQuery = useExpensesQuery(currentGroupId, {})
  const peopleQuery = usePeopleQuery(currentGroupId, true)
  const categoriesQuery = useCategoriesQuery(currentGroupId)
  const balancesQuery = useBalancesQuery(currentGroupId)
  const suggestionsQuery = useSettlementSuggestionsQuery(currentGroupId)
  const settlementsQuery = useSettlementHistoryQuery(currentGroupId)

  const queries = [
    expensesQuery,
    peopleQuery,
    categoriesQuery,
    balancesQuery,
    suggestionsQuery,
    settlementsQuery,
  ]
  const failed = queries.find((query) => query.isError)
  const ready = queries.every((query) => query.data !== undefined)

  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [nextId, setNextId] = useState(1)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function ask(question: string) {
    const trimmed = question.trim()
    if (!trimmed || !ready) return

    const reply = answerQuestion(trimmed, {
      people: peopleQuery.data ?? [],
      categories: categoriesQuery.data ?? [],
      expenses: expensesQuery.data ?? [],
      balances: balancesQuery.data ?? { total_outstanding: 0, balances: [] },
      suggestions: suggestionsQuery.data ?? [],
      settlements: settlementsQuery.data ?? [],
    })

    setMessages((current) => [
      ...current,
      { id: nextId, role: 'user', text: trimmed },
      { id: nextId + 1, role: 'assistant', text: reply.text, supported: reply.supported },
    ])
    setNextId((current) => current + 2)
    setDraft('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    ask(draft)
  }

  function retryAll() {
    queries.forEach((query) => {
      void query.refetch()
    })
  }

  return (
    <div
      className="drawer-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Insights assistant"
        ref={panelRef}
      >
        <header className="drawer__header">
          <div>
            <p className="drawer__title">Insights assistant</p>
            <p className="drawer__subtitle">Rule-based answers from this group&apos;s data</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close assistant"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <p className="drawer__notice">
          {isDemoMode()
            ? 'Demo data only, not a live account. No AI model is connected. Answers are calculated from the sample expenses, balances and settlements.'
            : "No AI model is connected. Answers are calculated only from this group's recorded expenses, balances and settlements."}
        </p>

        {!ready && !failed && <LoadingState label="Reading this group's data…" />}
        {failed && <ErrorState error={failed.error} onRetry={retryAll} />}

        <div className="drawer__messages" role="log" aria-live="polite">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`drawer__message drawer__message--${message.role} ${
                message.supported === false ? 'drawer__message--unsupported' : ''
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>

        <div className="drawer__suggestions" aria-label="Suggested questions">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              className="drawer__chip"
              disabled={!ready}
              onClick={() => ask(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <form className="drawer__form" onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="assistant-question">
            Ask a question
          </label>
          <div className="drawer__input-row">
            <input
              id="assistant-question"
              className="form-input"
              type="text"
              autoComplete="off"
              maxLength={MAX_QUESTION_LENGTH}
              placeholder={ready ? 'e.g. Who paid the most?' : 'Waiting for group data…'}
              value={draft}
              disabled={!ready}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              className="button button--primary drawer__send"
              disabled={!ready || draft.trim().length === 0}
            >
              Send
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
