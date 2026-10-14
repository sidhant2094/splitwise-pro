import { ApiRequestError } from '../api/errors.js'
import type { DemoPerson } from './demoData.js'

// Demo validation that mirrors server/src/validators/*.ts and the business
// rules in server/src/services/*.ts: the same limits, status codes and error
// codes, so the UI shows the same messages it would show against the API.

export const DESCRIPTION_MAX_LENGTH = 150
export const MIN_AMOUNT = 1
export const MAX_AMOUNT = 99999

export interface ExpenseBody {
  description: string
  amount: number
  paid_by: string
  category_id: string | null
  shares: { person_id: string; amount: number }[]
}

function validationError(fields: Record<string, string>): never {
  throw new ApiRequestError(400, 'VALIDATION_ERROR', 'Request validation failed.', fields)
}

export function assertDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    validationError({ description: 'Description is required.' })
  }
  const trimmed = (value as string).trim()
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    validationError({
      description: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`,
    })
  }
  return trimmed
}

export function assertAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    validationError({ amount: 'Amount must be a whole number.' })
  }
  const amount = value as number
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new ApiRequestError(
      422,
      'INVALID_EXPENSE_AMOUNT',
      `Amount must be between ₹${MIN_AMOUNT} and ₹${MAX_AMOUNT}.`,
    )
  }
  return amount
}

function assertPersonRef(personId: string, people: DemoPerson[], fieldLabel: string): void {
  const person = people.find((p) => p.id === personId)
  if (!person) {
    throw new ApiRequestError(404, 'PERSON_NOT_FOUND', `${fieldLabel} not found.`)
  }
  if (!person.is_active) {
    throw new ApiRequestError(422, 'INACTIVE_PERSON', `${fieldLabel} is not active.`)
  }
}

// Full expense rules: field shape first (400), then the business rules
// (422). Also checks that payer, participants and category belong to the group.
export function assertExpenseBody(
  body: ExpenseBody,
  groupPeople: DemoPerson[],
  groupCategoryIds: Set<string>,
): ExpenseBody {
  const description = assertDescription(body.description)
  const amount = assertAmount(body.amount)

  if (typeof body.paid_by !== 'string' || body.paid_by.trim().length === 0) {
    validationError({ paid_by: 'paid_by is required.' })
  }
  if (body.category_id !== null && typeof body.category_id !== 'string') {
    validationError({ category_id: 'category_id must be a string or null.' })
  }
  if (!Array.isArray(body.shares) || body.shares.length === 0) {
    validationError({ shares: 'At least one share is required.' })
  }

  body.shares.forEach((share, index) => {
    if (typeof share.person_id !== 'string' || share.person_id.trim().length === 0) {
      validationError({ [`shares[${index}].person_id`]: `shares[${index}].person_id is required.` })
    }
    if (typeof share.amount !== 'number' || !Number.isInteger(share.amount)) {
      validationError({ [`shares[${index}].amount`]: 'Share amount must be a whole number.' })
    }
  })

  assertPersonRef(body.paid_by, groupPeople, 'Payer')
  for (const share of body.shares) {
    assertPersonRef(share.person_id, groupPeople, 'Participant')
  }

  if (body.category_id !== null && !groupCategoryIds.has(body.category_id)) {
    throw new ApiRequestError(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
  }

  // Business rules (server validateShareBusinessRules).
  const seen = new Set<string>()
  for (const share of body.shares) {
    if (share.amount < 1) {
      throw new ApiRequestError(
        422,
        'INVALID_EXPENSE_SHARES',
        'Each participant share must be at least ₹1.',
      )
    }
    if (seen.has(share.person_id)) {
      throw new ApiRequestError(
        422,
        'INVALID_EXPENSE_SHARES',
        'A participant cannot appear more than once.',
      )
    }
    seen.add(share.person_id)
  }
  const total = body.shares.reduce((sum, share) => sum + share.amount, 0)
  if (total !== amount) {
    throw new ApiRequestError(422, 'INVALID_EXPENSE_SHARES', `Shares must total ₹${amount}.`)
  }

  return {
    description,
    amount,
    paid_by: body.paid_by,
    category_id: body.category_id,
    shares: body.shares,
  }
}
