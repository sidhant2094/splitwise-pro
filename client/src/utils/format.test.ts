import { describe, expect, it } from 'vitest'
import { formatDateTime, formatRupees, formatSignedRupees } from './format.js'

describe('money formatting', () => {
  it('groups rupees in the Indian numbering style', () => {
    expect(formatRupees(93650)).toBe('₹93,650')
    expect(formatRupees(1234567)).toBe('₹12,34,567')
    expect(formatRupees(0)).toBe('₹0')
  })

  it('shows the sign for balances and keeps the magnitude', () => {
    expect(formatSignedRupees(3183)).toBe('+₹3,183')
    expect(formatSignedRupees(-11450)).toBe('-₹11,450')
    expect(formatSignedRupees(0)).toBe('₹0')
  })
})

describe('date formatting', () => {
  // The exact wording follows the viewer's locale, so only the structure is
  // asserted: a day, a month, a four-digit year, a middle dot and a time.
  it('renders the date and time with a middle-dot separator', () => {
    const text = formatDateTime('2026-09-05T10:00:00.000Z')
    expect(text).toContain('2026')
    expect(text).toContain(' · ')
    expect(text).toMatch(/\d{1,2}:\d{2}/)
  })
})
