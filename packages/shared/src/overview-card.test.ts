import { describe, expect, it } from 'vitest'

import type { OverviewCategory, OverviewCell } from './overview'
import { overviewCellCard, OVERVIEW_CARD_HINT } from './overview-card'

// The hover card on an overview matrix cell (`/compare`): what the cell's number means, in
// words, from the fields the overview already sends.

function category(fields: Partial<OverviewCategory> = {}): OverviewCategory {
  return {
    id: 1,
    slug: 'kidney-failure',
    label: 'Kidney failure',
    definition: '',
    federalCategory: 'serious_complex_medical',
    sortOrder: 1,
    coverageBasis: 'universe',
    denominator: 2940,
    ...fields,
  }
}

function cell(fields: Partial<OverviewCell> = {}): OverviewCell {
  return {
    unifiedId: 1,
    entries: 12,
    qualifiesAlone: 8,
    qualifiesAloneShare: 8 / 12,
    covered: 1234,
    share: 1234 / 2940,
    reviewed: true,
    ...fields,
  }
}

describe('overviewCellCard', () => {
  it('words a universe cell: the share, codes covered, entries and review', () => {
    expect(overviewCellCard('Georgia', category(), cell())).toEqual({
      state: 'Georgia',
      category: 'Kidney failure',
      share: '42%',
      covered: 'Covers 1,234 of the category’s 2,940 diagnosis codes',
      entries: '12 entries placed here; 8 are enough by themselves (67%)',
      review: 'Every placement here was reviewed',
      hint: OVERVIEW_CARD_HINT,
    })
  })

  it('words a union cell as a share of the entries any state lists', () => {
    const card = overviewCellCard(
      'Montana',
      category({ label: 'Equipment', coverageBasis: 'union', denominator: 40 }),
      cell({ covered: 10, share: 0.25, entries: 10 }),
    )
    expect(card.covered).toBe('10 of the 40 distinct entries any state lists here')
  })

  it('uses the singular for one code, one entry and one that is enough by itself', () => {
    const card = overviewCellCard(
      'Nebraska',
      category({ denominator: 1 }),
      cell({ covered: 1, share: 1, entries: 1, qualifiesAlone: 1, qualifiesAloneShare: 1 }),
    )
    expect(card.covered).toBe('Covers 1 of the category’s 1 diagnosis code')
    expect(card.entries).toBe('1 entry placed here; 1 is enough by itself (100%)')
  })

  it('says none is enough by itself when no entry qualifies alone', () => {
    const card = overviewCellCard(
      'Georgia',
      category(),
      cell({ qualifiesAlone: 0, qualifiesAloneShare: 0 }),
    )
    expect(card.entries).toBe('12 entries placed here; none is enough by itself')
  })

  it('words an empty cell, with no review line', () => {
    const card = overviewCellCard(
      'Georgia',
      category(),
      cell({
        entries: 0,
        qualifiesAlone: 0,
        qualifiesAloneShare: null,
        covered: 0,
        share: 0,
        reviewed: false,
      }),
    )
    expect(card).toMatchObject({
      share: '0%',
      covered: 'Covers none of the category’s 2,940 diagnosis codes',
      entries: 'No entries placed here',
      review: null,
    })
  })

  it('marks a cell whose placements were not all reviewed', () => {
    const card = overviewCellCard('Georgia', category(), cell({ reviewed: false }))
    expect(card.review).toBe(
      'Not yet reviewed: some entries were placed here automatically, by the CCSR group of their code',
    )
  })

  it('says when there is nothing to divide by', () => {
    const empty = cell({ covered: 0, share: null, entries: 0, qualifiesAloneShare: null })
    expect(overviewCellCard('Georgia', category({ denominator: 0 }), empty).covered).toBe(
      'The category has no diagnosis codes to count yet',
    )
    expect(
      overviewCellCard('Georgia', category({ coverageBasis: 'union', denominator: 0 }), empty)
        .covered,
    ).toBe('No state lists an entry here yet')
  })

  it('points to the codes', () => {
    expect(OVERVIEW_CARD_HINT).toBe('Select the number to see the codes')
  })
})
