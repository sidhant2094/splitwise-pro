// Single source of truth for demo mode. Every number shown in demo mode
// (dashboard, balances, settlements, assistant answers, expense lists) is
// derived from these fixtures by ledger.ts and analytics.ts — nothing is
// hardcoded in a component. All values are fixed (no randomness, no "now"),
// so the demo is identical on every load.

export interface DemoGroup {
  id: string
  name: string
  created_at: string
}

export interface DemoPerson {
  id: string
  group_id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface DemoCategory {
  id: string
  group_id: string
  name: string
  created_at: string
}

export interface DemoShare {
  person_id: string
  amount: number
}

export interface DemoExpense {
  id: string
  group_id: string
  description: string
  amount: number
  paid_by: string
  category_id: string | null
  shares: DemoShare[]
  created_at: string
}

export interface DemoSettlement {
  id: string
  group_id: string
  from_person: string
  to_person: string
  amount: number
  created_at: string
}

export interface DemoState {
  groups: DemoGroup[]
  people: DemoPerson[]
  categories: DemoCategory[]
  expenses: DemoExpense[]
  settlements: DemoSettlement[]
}

const CREATED = '2026-06-28T09:00:00.000Z'

export const DEMO_GROUP_IDS = {
  goa: 'demo-group-goa',
  flat: 'demo-group-flat',
} as const

const GOA = DEMO_GROUP_IDS.goa
const FLAT = DEMO_GROUP_IDS.flat

const PEOPLE = {
  asha: 'demo-person-asha',
  ravi: 'demo-person-ravi',
  meera: 'demo-person-meera',
  kabir: 'demo-person-kabir',
  priya: 'demo-person-priya',
  dev: 'demo-person-dev',
}

const CATEGORY = {
  food: 'demo-cat-food',
  travel: 'demo-cat-travel',
  rent: 'demo-cat-rent',
  shopping: 'demo-cat-shopping',
  entertainment: 'demo-cat-entertainment',
  utilities: 'demo-cat-utilities',
  other: 'demo-cat-other',
}

// Dates are fixed UTC instants. Months used by the fixtures: 2026-07,
// 2026-08 and 2026-09.
function day(month: number, date: number, hour = 10): string {
  return new Date(Date.UTC(2026, month - 1, date, hour, 0, 0)).toISOString()
}

// Every fixture is written out explicitly (not computed) so the seed reads
// exactly as stored.
export function createSeedState(): DemoState {
  return {
    groups: [
      { id: GOA, name: 'Goa Trip', created_at: CREATED },
      { id: FLAT, name: 'Flat Expenses', created_at: CREATED },
    ],
    people: [
      { id: PEOPLE.asha, group_id: GOA, name: 'Asha', is_active: true, created_at: CREATED },
      { id: PEOPLE.ravi, group_id: GOA, name: 'Ravi', is_active: true, created_at: CREATED },
      { id: PEOPLE.meera, group_id: GOA, name: 'Meera', is_active: true, created_at: CREATED },
      { id: PEOPLE.kabir, group_id: GOA, name: 'Kabir', is_active: true, created_at: CREATED },
      { id: PEOPLE.priya, group_id: FLAT, name: 'Priya', is_active: true, created_at: CREATED },
      { id: PEOPLE.dev, group_id: FLAT, name: 'Dev', is_active: true, created_at: CREATED },
    ],
    categories: [
      { id: CATEGORY.food, group_id: GOA, name: 'Food', created_at: CREATED },
      { id: CATEGORY.travel, group_id: GOA, name: 'Travel', created_at: CREATED },
      { id: CATEGORY.rent, group_id: GOA, name: 'Rent', created_at: CREATED },
      { id: CATEGORY.shopping, group_id: GOA, name: 'Shopping', created_at: CREATED },
      { id: CATEGORY.entertainment, group_id: GOA, name: 'Entertainment', created_at: CREATED },
      { id: CATEGORY.utilities, group_id: GOA, name: 'Utilities', created_at: CREATED },
      { id: CATEGORY.other, group_id: GOA, name: 'Other', created_at: CREATED },
      { id: 'demo-cat-flat-food', group_id: FLAT, name: 'Food', created_at: CREATED },
      { id: 'demo-cat-flat-rent', group_id: FLAT, name: 'Rent', created_at: CREATED },
      { id: 'demo-cat-flat-utilities', group_id: FLAT, name: 'Utilities', created_at: CREATED },
    ],
    expenses: [
      {
        id: 'demo-exp-01',
        group_id: GOA,
        description: 'Flights to Goa',
        amount: 24000,
        paid_by: PEOPLE.asha,
        category_id: CATEGORY.travel,
        shares: [
          { person_id: PEOPLE.asha, amount: 6000 },
          { person_id: PEOPLE.ravi, amount: 6000 },
          { person_id: PEOPLE.meera, amount: 6000 },
          { person_id: PEOPLE.kabir, amount: 6000 },
        ],
        created_at: day(7, 3),
      },
      {
        id: 'demo-exp-02',
        group_id: GOA,
        description: 'Villa booking',
        amount: 36000,
        paid_by: PEOPLE.ravi,
        category_id: CATEGORY.rent,
        shares: [
          { person_id: PEOPLE.asha, amount: 9000 },
          { person_id: PEOPLE.ravi, amount: 9000 },
          { person_id: PEOPLE.meera, amount: 9000 },
          { person_id: PEOPLE.kabir, amount: 9000 },
        ],
        created_at: day(7, 4),
      },
      {
        id: 'demo-exp-03',
        group_id: GOA,
        description: "Dinner at Fisherman's Wharf",
        amount: 4200,
        paid_by: PEOPLE.meera,
        category_id: CATEGORY.food,
        shares: [
          { person_id: PEOPLE.asha, amount: 1050 },
          { person_id: PEOPLE.ravi, amount: 1050 },
          { person_id: PEOPLE.meera, amount: 1050 },
          { person_id: PEOPLE.kabir, amount: 1050 },
        ],
        created_at: day(7, 4, 21),
      },
      {
        id: 'demo-exp-04',
        group_id: GOA,
        description: 'Scooter rental',
        amount: 2400,
        paid_by: PEOPLE.kabir,
        category_id: CATEGORY.travel,
        shares: [
          { person_id: PEOPLE.asha, amount: 800 },
          { person_id: PEOPLE.ravi, amount: 800 },
          { person_id: PEOPLE.kabir, amount: 800 },
        ],
        created_at: day(7, 5),
      },
      {
        id: 'demo-exp-05',
        group_id: GOA,
        description: 'Groceries',
        amount: 3160,
        paid_by: PEOPLE.asha,
        category_id: CATEGORY.food,
        shares: [
          { person_id: PEOPLE.asha, amount: 790 },
          { person_id: PEOPLE.ravi, amount: 790 },
          { person_id: PEOPLE.meera, amount: 790 },
          { person_id: PEOPLE.kabir, amount: 790 },
        ],
        created_at: day(7, 6),
      },
      {
        id: 'demo-exp-06',
        group_id: GOA,
        description: 'Beach shack lunch',
        amount: 2750,
        paid_by: PEOPLE.ravi,
        category_id: CATEGORY.food,
        // 2750 / 3 leaves a remainder of 2; the first two participants in
        // selection order absorb it, matching the backend split rule.
        shares: [
          { person_id: PEOPLE.asha, amount: 917 },
          { person_id: PEOPLE.ravi, amount: 917 },
          { person_id: PEOPLE.meera, amount: 916 },
        ],
        created_at: day(7, 7),
      },
      {
        id: 'demo-exp-07',
        group_id: GOA,
        description: 'Water sports',
        amount: 6000,
        paid_by: PEOPLE.meera,
        category_id: CATEGORY.entertainment,
        shares: [
          { person_id: PEOPLE.asha, amount: 1500 },
          { person_id: PEOPLE.ravi, amount: 1500 },
          { person_id: PEOPLE.meera, amount: 1500 },
          { person_id: PEOPLE.kabir, amount: 1500 },
        ],
        created_at: day(7, 8),
      },
      {
        id: 'demo-exp-08',
        group_id: GOA,
        description: 'Sunset cruise',
        amount: 8000,
        paid_by: PEOPLE.kabir,
        category_id: CATEGORY.entertainment,
        shares: [
          { person_id: PEOPLE.asha, amount: 2000 },
          { person_id: PEOPLE.ravi, amount: 2000 },
          { person_id: PEOPLE.meera, amount: 2000 },
          { person_id: PEOPLE.kabir, amount: 2000 },
        ],
        created_at: day(8, 2),
      },
      {
        id: 'demo-exp-09',
        group_id: GOA,
        description: 'Souvenirs',
        amount: 1800,
        paid_by: PEOPLE.ravi,
        category_id: CATEGORY.shopping,
        shares: [
          { person_id: PEOPLE.asha, amount: 600 },
          { person_id: PEOPLE.ravi, amount: 600 },
          { person_id: PEOPLE.meera, amount: 600 },
        ],
        created_at: day(8, 4),
      },
      {
        id: 'demo-exp-10',
        group_id: GOA,
        description: 'Taxi to the airport',
        amount: 1200,
        paid_by: PEOPLE.asha,
        category_id: CATEGORY.travel,
        shares: [
          { person_id: PEOPLE.asha, amount: 600 },
          { person_id: PEOPLE.kabir, amount: 600 },
        ],
        created_at: day(8, 9),
      },
      {
        id: 'demo-exp-11',
        group_id: GOA,
        description: 'Electricity deposit',
        amount: 1600,
        paid_by: PEOPLE.meera,
        category_id: CATEGORY.utilities,
        shares: [
          { person_id: PEOPLE.asha, amount: 400 },
          { person_id: PEOPLE.ravi, amount: 400 },
          { person_id: PEOPLE.meera, amount: 400 },
          { person_id: PEOPLE.kabir, amount: 400 },
        ],
        created_at: day(8, 11),
      },
      {
        id: 'demo-exp-12',
        group_id: GOA,
        description: 'Cab from Mapusa',
        amount: 900,
        paid_by: PEOPLE.kabir,
        category_id: CATEGORY.travel,
        shares: [
          { person_id: PEOPLE.ravi, amount: 450 },
          { person_id: PEOPLE.kabir, amount: 450 },
        ],
        created_at: day(9, 1),
      },
      {
        id: 'demo-exp-13',
        group_id: GOA,
        description: 'Ice cream run',
        amount: 640,
        paid_by: PEOPLE.asha,
        category_id: CATEGORY.food,
        shares: [
          { person_id: PEOPLE.asha, amount: 160 },
          { person_id: PEOPLE.ravi, amount: 160 },
          { person_id: PEOPLE.meera, amount: 160 },
          { person_id: PEOPLE.kabir, amount: 160 },
        ],
        created_at: day(9, 6),
      },
      {
        id: 'demo-exp-14',
        group_id: GOA,
        description: 'Movie night',
        amount: 1000,
        paid_by: PEOPLE.ravi,
        category_id: null,
        shares: [
          { person_id: PEOPLE.ravi, amount: 500 },
          { person_id: PEOPLE.meera, amount: 500 },
        ],
        created_at: day(9, 9),
      },
      {
        id: 'demo-exp-15',
        group_id: FLAT,
        description: 'September rent',
        amount: 30000,
        paid_by: PEOPLE.priya,
        category_id: 'demo-cat-flat-rent',
        shares: [
          { person_id: PEOPLE.priya, amount: 15000 },
          { person_id: PEOPLE.dev, amount: 15000 },
        ],
        created_at: day(9, 1),
      },
      {
        id: 'demo-exp-16',
        group_id: FLAT,
        description: 'Electricity bill',
        amount: 2400,
        paid_by: PEOPLE.dev,
        category_id: 'demo-cat-flat-utilities',
        shares: [
          { person_id: PEOPLE.priya, amount: 1200 },
          { person_id: PEOPLE.dev, amount: 1200 },
        ],
        created_at: day(9, 3),
      },
      {
        id: 'demo-exp-17',
        group_id: FLAT,
        description: 'Groceries',
        amount: 1850,
        paid_by: PEOPLE.priya,
        category_id: 'demo-cat-flat-food',
        shares: [
          { person_id: PEOPLE.priya, amount: 925 },
          { person_id: PEOPLE.dev, amount: 925 },
        ],
        created_at: day(9, 5),
      },
    ],
    settlements: [
      {
        id: 'demo-set-01',
        group_id: GOA,
        from_person: PEOPLE.ravi,
        to_person: PEOPLE.asha,
        amount: 2000,
        created_at: day(8, 20),
      },
    ],
  }
}
