import { useMemo } from 'react'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorState } from '../components/ErrorState.js'
import { LoadingState } from '../components/LoadingState.js'
import { useAssistant } from '../context/AssistantContext.js'
import { useCurrentGroup } from '../context/GroupContext.js'
import { formatMonthKey, personTotals, summarizeExpenses } from '../insights/analytics.js'
import { isDemoMode } from '../demo/mode.js'
import { useBalancesQuery } from '../hooks/useBalances.js'
import { useExpensesQuery } from '../hooks/useExpenses.js'
import { usePeopleQuery } from '../hooks/usePeople.js'
import { useSettlementHistoryQuery } from '../hooks/useSettlements.js'
import { formatRupees, formatSignedRupees } from '../utils/format.js'

// Every figure is derived from the same queries the rest of the app uses
// (expenses, people, balances, settlements). The three per-person measures are
// kept apart: paid is what someone advanced, share is what they consumed, and
// balance is what is still owed or due after settlements.

// Chart colours are defined as tokens in theme.css; these names match them.
const CHART_TOKENS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

export function DashboardScreen() {
  const { currentGroupId } = useCurrentGroup()
  const { openAssistant } = useAssistant()

  const expensesQuery = useExpensesQuery(currentGroupId, {})
  const peopleQuery = usePeopleQuery(currentGroupId, true)
  const balancesQuery = useBalancesQuery(currentGroupId)
  const settlementsQuery = useSettlementHistoryQuery(currentGroupId)

  const queries = [expensesQuery, peopleQuery, balancesQuery, settlementsQuery]
  const failed = queries.find((query) => query.isError)

  const summary = useMemo(() => summarizeExpenses(expensesQuery.data ?? []), [expensesQuery.data])

  const people = useMemo(
    () =>
      personTotals(
        expensesQuery.data ?? [],
        peopleQuery.data ?? [],
        balancesQuery.data?.balances ?? [],
      ),
    [expensesQuery.data, peopleQuery.data, balancesQuery.data],
  )

  if (queries.some((query) => query.isPending)) {
    return (
      <div className="screen">
        <PageHeader />
        <div className="screen__body">
          <LoadingState label="Loading dashboard…" />
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="screen">
        <PageHeader />
        <div className="screen__body">
          <ErrorState
            error={failed.error}
            onRetry={() => queries.forEach((query) => void query.refetch())}
          />
        </div>
      </div>
    )
  }

  const settlements = settlementsQuery.data ?? []
  const settledTotal = settlements.reduce((sum, s) => sum + s.amount, 0)
  const outstanding = balancesQuery.data?.total_outstanding ?? 0
  const maxMonth = Math.max(0, ...summary.months.map((m) => m.total))

  return (
    <div className="screen">
      <PageHeader />

      <div className="screen__body">
        {isDemoMode() && (
          <p className="demo-caption">Figures from demo data. Nothing here is a live account.</p>
        )}

        {summary.count === 0 ? (
          <EmptyState
            title="No expenses yet"
            body="Add an expense to see totals, charts and balances here."
          />
        ) : (
          <>
            <section className="hero-card" aria-label="Group total">
              <span className="hero-card__label">Total spent</span>
              <span className="hero-card__value">{formatRupees(summary.total)}</span>
              <span className="hero-card__meta">
                {summary.count} expenses · average {formatRupees(summary.average)}
              </span>
            </section>

            <div className="metric-grid" role="group" aria-label="Summary">
              <MetricCard
                label="Outstanding"
                value={formatRupees(outstanding)}
                hint="Sum of what people still should receive"
                tone="positive"
              />
              <MetricCard
                label="Settled so far"
                value={formatRupees(settledTotal)}
                hint={`${settlements.length} settlement${settlements.length === 1 ? '' : 's'} logged`}
              />
            </div>

            {summary.largest && (
              <section className="section">
                <h2 className="section__title">Largest expense</h2>
                <div className="card dash-card">
                  <div className="list-row list-row--static">
                    <div className="list-row__main">
                      <div className="list-row__title">{summary.largest.description}</div>
                      <div className="list-row__subtitle">
                        Paid by {summary.largest.paid_by.name}
                        {summary.largest.category ? ` · ${summary.largest.category.name}` : ''}
                      </div>
                    </div>
                    <span className="amount">{formatRupees(summary.largest.amount)}</span>
                  </div>
                </div>
              </section>
            )}

            <section className="section">
              <h2 className="section__title">Spending by category</h2>
              <div className="card dash-card">
                <CategoryDonut categories={summary.categories} total={summary.total} />
              </div>
            </section>

            <section className="section">
              <h2 className="section__title">Monthly spending</h2>
              <div className="card dash-card">
                {summary.months.map((month) => (
                  <BarRow
                    key={month.key}
                    label={formatMonthKey(month.key)}
                    value={month.total}
                    max={maxMonth}
                    detail={`${month.count} expense${month.count === 1 ? '' : 's'}`}
                  />
                ))}
              </div>
            </section>

            <section className="section">
              <h2 className="section__title">People</h2>
              <div className="card dash-card">
                <div className="person-table" role="table" aria-label="Per-person totals">
                  <div className="person-table__row person-table__row--head" role="row">
                    <span role="columnheader">Person</span>
                    <span role="columnheader">Paid</span>
                    <span role="columnheader">Share</span>
                    <span role="columnheader">Balance</span>
                  </div>
                  {people.map((person) => (
                    <div className="person-table__row" role="row" key={person.person_id}>
                      <span role="cell" className="person-table__name">
                        <span className="avatar" aria-hidden="true">
                          {person.person_name.charAt(0).toUpperCase()}
                        </span>
                        {person.person_name}
                      </span>
                      <span role="cell">{formatRupees(person.paid)}</span>
                      <span role="cell">{formatRupees(person.share)}</span>
                      <span
                        role="cell"
                        className={
                          person.balance > 0
                            ? 'amount amount--positive'
                            : person.balance < 0
                              ? 'amount amount--negative'
                              : 'amount'
                        }
                      >
                        {formatSignedRupees(person.balance)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="dash-card__note">
                  Paid is what each person advanced. Share is what they consumed. Balance is what is
                  still owed (−) or due (+) after settlements.
                </p>
              </div>
            </section>
          </>
        )}

        <section className="section">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => openAssistant?.()}
          >
            Ask the insights assistant
          </button>
        </section>
      </div>
    </div>
  )
}

function PageHeader() {
  return (
    <header className="screen__header">
      <span className="screen__title">Dashboard</span>
    </header>
  )
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive'
}) {
  return (
    <div className="metric-card">
      <span className="metric-card__label">{label}</span>
      <span className={`metric-card__value ${tone === 'positive' ? 'amount--positive' : ''}`}>
        {value}
      </span>
      {hint && <span className="metric-card__hint">{hint}</span>}
    </div>
  )
}

function CategoryDonut({
  categories,
  total,
}: {
  categories: { name: string; total: number; count: number }[]
  total: number
}) {
  const radius = 42
  const circumference = 2 * Math.PI * radius

  // Each segment starts where the previous ones end. Computed from the array,
  // not by mutating a counter during render.
  const segments = categories.map((category, index) => {
    const length = (category.total / total) * circumference
    const start = categories
      .slice(0, index)
      .reduce((sum, previous) => sum + (previous.total / total) * circumference, 0)
    return { category, index, length, start }
  })

  return (
    <div className="donut">
      <svg
        className="donut__svg"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Spending by category, ${formatRupees(total)} in total`}
      >
        <circle cx="60" cy="60" r={radius} className="donut__track" />
        {segments.map(({ category, index, length, start }) => (
          <circle
            key={category.name}
            cx="60"
            cy="60"
            r={radius}
            className="donut__segment"
            stroke={CHART_TOKENS[index % CHART_TOKENS.length]}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-start}
          />
        ))}
      </svg>
      <ul className="donut__legend">
        {categories.map((category, index) => (
          <li key={category.name}>
            <span
              className="donut__swatch"
              style={{ background: CHART_TOKENS[index % CHART_TOKENS.length] }}
              aria-hidden="true"
            />
            <span className="donut__name">{category.name}</span>
            <span className="donut__amount">
              {formatRupees(category.total)}
              <span className="donut__pct"> {Math.round((category.total / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BarRow({
  label,
  value,
  max,
  detail,
}: {
  label: string
  value: number
  max: number
  detail: string
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-row">
      <div className="bar-row__head">
        <span className="bar-row__label">{label}</span>
        <span className="bar-row__value">
          {formatRupees(value)} <span className="bar-row__detail">· {detail}</span>
        </span>
      </div>
      <div className="bar-row__track" role="img" aria-label={`${label}: ${formatRupees(value)}`}>
        <div className="bar-row__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
