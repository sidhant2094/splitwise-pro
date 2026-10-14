import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BalanceList } from '../components/BalanceList.js'
import { CreateGroupSheet } from '../components/CreateGroupSheet.js'
import { ErrorState } from '../components/ErrorState.js'
import { FilterSortBar, type HomeFilterState } from '../components/FilterSortBar.js'
import { FloatingAddButton } from '../components/FloatingAddButton.js'
import { GroupSelectorSheet } from '../components/GroupSelectorSheet.js'
import { LoadingState } from '../components/LoadingState.js'
import { TopHeader } from '../components/TopHeader.js'
import { TransactionList } from '../components/TransactionList.js'
import { useCurrentGroup } from '../context/GroupContext.js'
import { useBalancesQuery } from '../hooks/useBalances.js'
import { useCategoriesQuery } from '../hooks/useCategories.js'
import { useExpensesQuery } from '../hooks/useExpenses.js'
import { useCreateGroupMutation, useGroupQuery, useGroupsQuery } from '../hooks/useGroups.js'
import { usePeopleQuery } from '../hooks/usePeople.js'
import { monthToRange } from '../utils/dateRange.js'

type ActiveSheet = 'none' | 'groupSelector' | 'createGroup'

export function HomeScreen() {
  const navigate = useNavigate()
  const { currentGroupId, setCurrentGroupId } = useCurrentGroup()
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none')
  const [filters, setFilters] = useState<HomeFilterState>({ sort: 'newest' })
  const [search, setSearch] = useState('')

  const groupQuery = useGroupQuery(currentGroupId)
  const groupsQuery = useGroupsQuery()
  const createGroupMutation = useCreateGroupMutation()
  const balancesQuery = useBalancesQuery(currentGroupId)
  const categoriesQuery = useCategoriesQuery(currentGroupId)
  // Include inactive people here: this list only feeds the "filter by
  // person" dropdown below, which should still let you filter the visible
  // history down to a person who has since been removed from the group.
  // Payer/participant selection for new expenses is handled separately in
  // AddExpenseScreen/ExpenseForm and stays active-only.
  const peopleQuery = usePeopleQuery(currentGroupId, true)

  const { from, to } = useMemo(() => monthToRange(filters.month), [filters.month])
  const expensesQuery = useExpensesQuery(currentGroupId, {
    categoryId: filters.categoryId,
    personId: filters.personId,
    from,
    to,
    sort: filters.sort,
  })

  const hasActiveFilters = Boolean(
    filters.categoryId || filters.personId || filters.month || search.trim(),
  )

  // Text search is applied to the loaded list, since the API has no search
  // parameter. It matches the description, payer name and category name.
  const visibleExpenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    const expenses = expensesQuery.data ?? []
    if (!term) return expenses
    return expenses.filter(
      (expense) =>
        expense.description.toLowerCase().includes(term) ||
        expense.paid_by.name.toLowerCase().includes(term) ||
        (expense.category?.name.toLowerCase().includes(term) ?? false),
    )
  }, [expensesQuery.data, search])

  return (
    <div className="screen">
      <TopHeader
        groupName={groupQuery.data?.name ?? '…'}
        onOpenSettings={() => navigate('/settings')}
        onOpenGroupSelector={() => setActiveSheet('groupSelector')}
        onOpenSettlement={() => navigate('/settlement')}
      />

      <div className="screen__body">
        <div className="section" style={{ marginTop: 'var(--space-2)' }}>
          <h2 className="section__title">Group Balance</h2>
          {balancesQuery.isLoading ? (
            <LoadingState label="Loading balances…" />
          ) : balancesQuery.isError ? (
            <ErrorState error={balancesQuery.error} onRetry={() => balancesQuery.refetch()} />
          ) : (
            <BalanceList balances={balancesQuery.data?.balances ?? []} />
          )}
        </div>

        <div className="section">
          <h2 className="section__title">Recent</h2>
          <input
            type="search"
            className="form-input search-input"
            aria-label="Search expenses"
            placeholder="Search expenses"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterSortBar
            categories={categoriesQuery.data ?? []}
            people={peopleQuery.data ?? []}
            filters={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          />
          {expensesQuery.isLoading ? (
            <LoadingState label="Loading transactions…" />
          ) : expensesQuery.isError ? (
            <ErrorState error={expensesQuery.error} onRetry={() => expensesQuery.refetch()} />
          ) : (
            <TransactionList
              expenses={visibleExpenses}
              emptyTitle={
                hasActiveFilters ? 'No transactions match these filters.' : 'No expenses yet.'
              }
              emptyBody={hasActiveFilters ? undefined : 'Add your first expense.'}
              onSelect={(expenseId) => navigate(`/expenses/${expenseId}`)}
            />
          )}
        </div>
      </div>

      <FloatingAddButton onClick={() => navigate('/add-expense')} />

      {activeSheet === 'groupSelector' && (
        <GroupSelectorSheet
          groups={groupsQuery.data ?? []}
          currentGroupId={currentGroupId}
          onSelect={(groupId) => {
            setCurrentGroupId(groupId)
            setActiveSheet('none')
          }}
          onCreateNew={() => setActiveSheet('createGroup')}
          onClose={() => setActiveSheet('none')}
        />
      )}

      {activeSheet === 'createGroup' && (
        <CreateGroupSheet
          onCreate={async (name) => {
            const group = await createGroupMutation.mutateAsync(name)
            setCurrentGroupId(group.id)
            setActiveSheet('none')
          }}
          onCancel={() => setActiveSheet('none')}
        />
      )}
    </div>
  )
}
