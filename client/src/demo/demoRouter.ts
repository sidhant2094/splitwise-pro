import { ApiRequestError } from '../api/errors.js'
import type {
  BalancesResult,
  Category,
  Expense,
  ExpenseSort,
  Group,
  Person,
  Settlement,
  SettlementSuggestion,
} from '../api/types.js'
import { DEMO_ADMIN_PASSWORD } from './mode.js'
import type { DemoExpense, DemoPerson, DemoSettlement, DemoState } from './demoData.js'
import { getDemoState } from './demoStore.js'
import { computeBalances, computeSettlementSuggestions } from './ledger.js'
import { assertDescription, assertExpenseBody, type ExpenseBody } from './validation.js'

// An in-process stand-in for the Express API, used only in demo mode. It
// implements the same routes, DTO shapes, status codes and error codes as
// server/src/routes and server/src/controllers, and operates on the in-memory
// store. Nothing here touches the network. If a route or rule changes on the
// server, change it here too.

export interface DemoRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | undefined>
  body?: unknown
  adminPassword?: string
}

interface Ctx {
  state: DemoState
  params: Record<string, string>
  query: Record<string, string | undefined>
  body: Record<string, unknown>
  adminPassword?: string
}

type Handler = (ctx: Ctx) => unknown

interface Route {
  method: DemoRequestOptions['method']
  segments: string[]
  handler: Handler
}

const ROUTES: Route[] = []

function add(method: DemoRequestOptions['method'], pattern: string, handler: Handler) {
  ROUTES.push({ method, segments: pattern.split('/').filter(Boolean), handler })
}

function fail(status: number, code: string, message: string): never {
  throw new ApiRequestError(status, code, message)
}

function requireAdmin(adminPassword: string | undefined): void {
  if (!adminPassword) {
    fail(401, 'ADMIN_PASSWORD_REQUIRED', 'Admin authorization failed.')
  }
  if (adminPassword !== DEMO_ADMIN_PASSWORD) {
    fail(401, 'INVALID_ADMIN_PASSWORD', 'Admin authorization failed.')
  }
}

function findGroup(state: DemoState, groupId: string) {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) fail(404, 'GROUP_NOT_FOUND', 'Group not found.')
  return group
}

function personName(state: DemoState, personId: string): string {
  return state.people.find((p) => p.id === personId)?.name ?? personId
}

function toPersonRef(state: DemoState, personId: string) {
  return { id: personId, name: personName(state, personId) }
}

function toGroup(group: { id: string; name: string; created_at: string }): Group {
  return { id: group.id, name: group.name, created_at: group.created_at }
}

function toPerson(person: DemoPerson): Person {
  return {
    id: person.id,
    name: person.name,
    is_active: person.is_active,
    created_at: person.created_at,
  }
}

function toCategory(category: { id: string; name: string; created_at: string }): Category {
  return { id: category.id, name: category.name, created_at: category.created_at }
}

function toExpense(state: DemoState, expense: DemoExpense): Expense {
  const category = expense.category_id
    ? state.categories.find((c) => c.id === expense.category_id)
    : undefined
  return {
    id: expense.id,
    description: expense.description,
    amount: expense.amount,
    paid_by: toPersonRef(state, expense.paid_by),
    category: category ? { id: category.id, name: category.name } : null,
    shares: expense.shares.map((share) => ({
      person_id: share.person_id,
      person_name: personName(state, share.person_id),
      amount: share.amount,
    })),
    created_at: expense.created_at,
  }
}

function toSettlement(state: DemoState, settlement: DemoSettlement): Settlement {
  return {
    id: settlement.id,
    from_person: toPersonRef(state, settlement.from_person),
    to_person: toPersonRef(state, settlement.to_person),
    amount: settlement.amount,
    created_at: settlement.created_at,
  }
}

function groupExpenses(state: DemoState, groupId: string): DemoExpense[] {
  return state.expenses.filter((e) => e.group_id === groupId)
}

function groupSettlements(state: DemoState, groupId: string): DemoSettlement[] {
  return state.settlements.filter((s) => s.group_id === groupId)
}

function groupPeople(state: DemoState, groupId: string): DemoPerson[] {
  return state.people.filter((p) => p.group_id === groupId)
}

function categoryIds(state: DemoState, groupId: string): Set<string> {
  return new Set(state.categories.filter((c) => c.group_id === groupId).map((c) => c.id))
}

// Deterministic ids for records created during a demo session (no randomness).
let idSequence = 0

function nextId(prefix: string): string {
  idSequence += 1
  return `${prefix}-new-${idSequence}`
}

// Server requireNonBlankString: 400 VALIDATION_ERROR when missing or too long.
function requireNonBlank(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(400, 'VALIDATION_ERROR', 'Request validation failed.')
  }
  const trimmed = (value as string).trim()
  if (trimmed.length > maxLength) {
    throw new ApiRequestError(400, 'VALIDATION_ERROR', 'Request validation failed.', {
      [field]: `${field} must be at most ${maxLength} characters.`,
    })
  }
  return trimmed
}

function expenseBodyFrom(body: Record<string, unknown>): ExpenseBody {
  return {
    description: body.description as string,
    amount: body.amount as number,
    paid_by: body.paid_by as string,
    category_id: (body.category_id ?? null) as string | null,
    shares: (body.shares ?? []) as { person_id: string; amount: number }[],
  }
}

function sortExpenses(expenses: DemoExpense[], sort: ExpenseSort | undefined): DemoExpense[] {
  const newestFirst = (a: DemoExpense, b: DemoExpense) =>
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  const oldestFirst = (a: DemoExpense, b: DemoExpense) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

  switch (sort) {
    case 'oldest':
      return [...expenses].sort(oldestFirst)
    case 'amount_desc':
      return [...expenses].sort((a, b) => b.amount - a.amount || newestFirst(a, b))
    case 'amount_asc':
      return [...expenses].sort((a, b) => a.amount - b.amount || newestFirst(a, b))
    case 'newest':
    default:
      return [...expenses].sort(newestFirst)
  }
}

function balancesFor(state: DemoState, groupId: string): BalancesResult {
  return computeBalances({
    people: groupPeople(state, groupId),
    expenses: groupExpenses(state, groupId),
    settlements: groupSettlements(state, groupId),
  })
}

// ---- Groups ---------------------------------------------------------------

add('GET', '/groups', ({ state }) => state.groups.map(toGroup))

add('POST', '/groups', ({ state, body }) => {
  const name = requireNonBlank(body.name, 'name', 100)
  const id = nextId('demo-group')
  const created_at = new Date().toISOString()
  // createGroup on the server inserts only the group row: no categories are
  // seeded, so the demo does the same.
  state.groups.push({ id, name, created_at })
  return toGroup({ id, name, created_at })
})

add('GET', '/groups/:groupId', ({ state, params }) => toGroup(findGroup(state, params.groupId)))

add('PATCH', '/groups/:groupId', ({ state, params, body }) => {
  const group = findGroup(state, params.groupId)
  group.name = requireNonBlank(body.name, 'name', 100)
  return toGroup(group)
})

add('DELETE', '/groups/:groupId', ({ state, params, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)
  const gid = params.groupId
  // Cascades as in the schema: people, categories, expenses, shares and
  // settlements belong to the group.
  state.groups = state.groups.filter((g) => g.id !== gid)
  state.people = state.people.filter((p) => p.group_id !== gid)
  state.categories = state.categories.filter((c) => c.group_id !== gid)
  state.expenses = state.expenses.filter((e) => e.group_id !== gid)
  state.settlements = state.settlements.filter((s) => s.group_id !== gid)
  return undefined
})

// ---- People ---------------------------------------------------------------

add('GET', '/groups/:groupId/people', ({ state, params, query }) => {
  findGroup(state, params.groupId)
  const includeInactive = query.includeInactive === 'true'
  return groupPeople(state, params.groupId)
    .filter((p) => includeInactive || p.is_active)
    .map(toPerson)
})

add('POST', '/groups/:groupId/people', ({ state, params, body }) => {
  findGroup(state, params.groupId)
  const name = requireNonBlank(body.name, 'name', 100)
  // UNIQUE (group_id, name) in the schema covers inactive people too.
  if (groupPeople(state, params.groupId).some((p) => p.name === name)) {
    fail(409, 'DUPLICATE_PERSON_NAME', 'A person with this name already exists in the group.')
  }
  const person: DemoPerson = {
    id: nextId('demo-person'),
    group_id: params.groupId,
    name,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  state.people.push(person)
  return toPerson(person)
})

add('PATCH', '/groups/:groupId/people/:personId', ({ state, params, body, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)
  const person = groupPeople(state, params.groupId).find((p) => p.id === params.personId)
  if (!person) fail(404, 'PERSON_NOT_FOUND', 'Person not found.')
  if (body.is_active !== false) {
    throw new ApiRequestError(400, 'VALIDATION_ERROR', 'Request validation failed.', {
      is_active: 'is_active must be false.',
    })
  }
  person.is_active = false
  return toPerson(person)
})

// ---- Categories -----------------------------------------------------------

add('GET', '/groups/:groupId/categories', ({ state, params }) => {
  findGroup(state, params.groupId)
  return state.categories.filter((c) => c.group_id === params.groupId).map(toCategory)
})

add('POST', '/groups/:groupId/categories', ({ state, params, body }) => {
  findGroup(state, params.groupId)
  const name = requireNonBlank(body.name, 'name', 50)
  if (state.categories.some((c) => c.group_id === params.groupId && c.name === name)) {
    fail(409, 'DUPLICATE_CATEGORY_NAME', 'A category with this name already exists in the group.')
  }
  const category = {
    id: nextId('demo-cat'),
    group_id: params.groupId,
    name,
    created_at: new Date().toISOString(),
  }
  state.categories.push(category)
  return toCategory(category)
})

add('DELETE', '/groups/:groupId/categories/:categoryId', ({ state, params }) => {
  findGroup(state, params.groupId)
  const exists = state.categories.some(
    (c) => c.id === params.categoryId && c.group_id === params.groupId,
  )
  if (!exists) fail(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
  state.categories = state.categories.filter((c) => c.id !== params.categoryId)
  // ON DELETE SET NULL: expenses keep their history and become uncategorised.
  for (const expense of state.expenses) {
    if (expense.category_id === params.categoryId) expense.category_id = null
  }
  return undefined
})

// ---- Expenses -------------------------------------------------------------

add('GET', '/groups/:groupId/expenses', ({ state, params, query }) => {
  findGroup(state, params.groupId)
  let expenses = groupExpenses(state, params.groupId)

  if (query.categoryId) {
    expenses = expenses.filter((e) => e.category_id === query.categoryId)
  }
  if (query.personId) {
    expenses = expenses.filter(
      (e) => e.paid_by === query.personId || e.shares.some((s) => s.person_id === query.personId),
    )
  }
  if (query.from) {
    expenses = expenses.filter((e) => e.created_at >= (query.from as string))
  }
  if (query.to) {
    expenses = expenses.filter((e) => e.created_at <= (query.to as string))
  }

  return sortExpenses(expenses, query.sort as ExpenseSort | undefined).map((e) =>
    toExpense(state, e),
  )
})

add('POST', '/groups/:groupId/expenses', ({ state, params, body }) => {
  findGroup(state, params.groupId)
  const input = assertExpenseBody(
    expenseBodyFrom(body),
    groupPeople(state, params.groupId),
    categoryIds(state, params.groupId),
  )
  const expense: DemoExpense = {
    id: nextId('demo-exp'),
    group_id: params.groupId,
    description: input.description,
    amount: input.amount,
    paid_by: input.paid_by,
    category_id: input.category_id,
    shares: input.shares.map((s) => ({ person_id: s.person_id, amount: s.amount })),
    created_at: new Date().toISOString(),
  }
  state.expenses.push(expense)
  return toExpense(state, expense)
})

add('GET', '/groups/:groupId/expenses/:expenseId', ({ state, params }) => {
  findGroup(state, params.groupId)
  const expense = groupExpenses(state, params.groupId).find((e) => e.id === params.expenseId)
  if (!expense) fail(404, 'EXPENSE_NOT_FOUND', 'Expense not found.')
  return toExpense(state, expense)
})

add('PATCH', '/groups/:groupId/expenses/:expenseId', ({ state, params, body, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)
  const expense = groupExpenses(state, params.groupId).find((e) => e.id === params.expenseId)
  if (!expense) fail(404, 'EXPENSE_NOT_FOUND', 'Expense not found.')

  // Partial update: merge the fields present in the body, then validate the
  // full result with the same rules as creation.
  const merged = assertExpenseBody(
    {
      description:
        'description' in body ? assertDescription(body.description) : expense.description,
      amount: 'amount' in body ? (body.amount as number) : expense.amount,
      paid_by: 'paid_by' in body ? (body.paid_by as string) : expense.paid_by,
      category_id:
        'category_id' in body ? ((body.category_id ?? null) as string | null) : expense.category_id,
      shares:
        'shares' in body
          ? (body.shares as { person_id: string; amount: number }[])
          : expense.shares,
    },
    groupPeople(state, params.groupId),
    categoryIds(state, params.groupId),
  )

  expense.description = merged.description
  expense.amount = merged.amount
  expense.paid_by = merged.paid_by
  expense.category_id = merged.category_id
  expense.shares = merged.shares.map((s) => ({ person_id: s.person_id, amount: s.amount }))
  return toExpense(state, expense)
})

add('DELETE', '/groups/:groupId/expenses/:expenseId', ({ state, params, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)
  const exists = groupExpenses(state, params.groupId).some((e) => e.id === params.expenseId)
  if (!exists) fail(404, 'EXPENSE_NOT_FOUND', 'Expense not found.')
  state.expenses = state.expenses.filter((e) => e.id !== params.expenseId)
  return undefined
})

add('DELETE', '/groups/:groupId/expenses', ({ state, params, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)
  // Settlement history is preserved, matching the Settings copy.
  state.expenses = state.expenses.filter((e) => e.group_id !== params.groupId)
  return undefined
})

// ---- Balances and settlements ---------------------------------------------

add('GET', '/groups/:groupId/balances', ({ state, params }) => {
  findGroup(state, params.groupId)
  return balancesFor(state, params.groupId)
})

add('GET', '/groups/:groupId/settlements/suggestions', ({ state, params }) => {
  findGroup(state, params.groupId)
  const suggestions: SettlementSuggestion[] = computeSettlementSuggestions(
    balancesFor(state, params.groupId).balances,
  )
  return { suggestions }
})

add('GET', '/groups/:groupId/settlements', ({ state, params }) => {
  findGroup(state, params.groupId)
  return groupSettlements(state, params.groupId)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .map((s) => toSettlement(state, s))
})

add('POST', '/groups/:groupId/settlements', ({ state, params, body, adminPassword }) => {
  requireAdmin(adminPassword)
  findGroup(state, params.groupId)

  // Shape (400), then business rules (422), then person checks (404/422),
  // in the same order as server/src/validators/settlements.ts and
  // settlements.service.ts.
  const fields: Record<string, string> = {}
  if (typeof body.from_person !== 'string' || body.from_person.trim() === '') {
    fields.from_person = 'from_person is required.'
  }
  if (typeof body.to_person !== 'string' || body.to_person.trim() === '') {
    fields.to_person = 'to_person is required.'
  }
  if (Object.keys(fields).length > 0) {
    throw new ApiRequestError(400, 'VALIDATION_ERROR', 'Request validation failed.', fields)
  }
  if (typeof body.amount !== 'number' || !Number.isInteger(body.amount)) {
    throw new ApiRequestError(400, 'VALIDATION_ERROR', 'Request validation failed.', {
      amount: 'Amount must be a whole number.',
    })
  }

  const from = body.from_person as string
  const to = body.to_person as string
  const amount = body.amount

  if (amount < 1) fail(422, 'INVALID_SETTLEMENT', 'Amount must be at least ₹1.')
  if (from === to) {
    fail(422, 'INVALID_SETTLEMENT', 'from_person and to_person must be different.')
  }

  const people = groupPeople(state, params.groupId)
  for (const [personId, label] of [
    [from, 'from_person'],
    [to, 'to_person'],
  ] as const) {
    const person = people.find((p) => p.id === personId)
    if (!person) fail(404, 'PERSON_NOT_FOUND', `${label} not found.`)
    if (!person.is_active) fail(422, 'INACTIVE_PERSON', `${label} is not active.`)
  }

  // A settlement may not exceed the sender's current debt.
  const senderBalance =
    balancesFor(state, params.groupId).balances.find((b) => b.person_id === from)?.balance ?? 0
  const maxValid = senderBalance < 0 ? -senderBalance : 0
  if (amount > maxValid) {
    fail(
      422,
      'INVALID_SETTLEMENT',
      `Settlement amount exceeds the sender's outstanding debt of ₹${maxValid}.`,
    )
  }

  const settlement: DemoSettlement = {
    id: nextId('demo-set'),
    group_id: params.groupId,
    from_person: from,
    to_person: to,
    amount,
    created_at: new Date().toISOString(),
  }
  state.settlements.push(settlement)
  return toSettlement(state, settlement)
})

// ---- Dispatch -------------------------------------------------------------

function matchRoute(
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  const segments = pathname.split('/').filter(Boolean)
  for (const route of ROUTES) {
    if (route.method !== method || route.segments.length !== segments.length) continue
    const params: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < segments.length; i += 1) {
      const pattern = route.segments[i]
      if (pattern.startsWith(':')) {
        params[pattern.slice(1)] = decodeURIComponent(segments[i])
      } else if (pattern !== segments[i]) {
        matched = false
        break
      }
    }
    if (matched) return { route, params }
  }
  return null
}

// Resolves with the same `data` payload the real API would send (or
// undefined for 204 responses). Rejects with ApiRequestError for business and
// validation failures, just like the HTTP client does.
export function demoRequest<T>(options: DemoRequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const match = matchRoute(options.method, options.path)
      if (!match) {
        fail(404, 'NOT_FOUND', 'The requested resource was not found.')
      }
      const result = match.route.handler({
        state: getDemoState(),
        params: match.params,
        query: options.query ?? {},
        body: (options.body ?? {}) as Record<string, unknown>,
        adminPassword: options.adminPassword,
      })
      resolve(result as T)
    } catch (error) {
      reject(error)
    }
  })
}
