import { describe, expect, it } from 'vitest'

import {
  coverageBand,
  coveragePercent,
  nextOverviewOrder,
  type OverviewCategory,
  type OverviewCell,
  overviewCategoryGroups,
  overviewCellLabel,
  overviewCellNotReviewed,
  overviewCellText,
  overviewDrillDownPath,
  type OverviewOrder,
  overviewOrderAnnouncement,
  overviewOverall,
  type OverviewState,
  orderOverviewStates,
} from './overview'

// The overview matrix's wording, numbers and orders (roadmap M5 step 5). The Vue page and the
// Worker's server-rendered HTML both use these, so they show the same thing.

function category(id: number, fields: Partial<OverviewCategory> = {}): OverviewCategory {
  return {
    id,
    slug: `cat-${String(id)}`,
    label: `Category ${String(id)}`,
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 0,
    coverageBasis: 'universe',
    denominator: 100,
    ...fields,
  }
}

function cell(unifiedId: number, share: number | null, fields: Partial<OverviewCell> = {}) {
  const entries = share === null || share === 0 ? 0 : 5
  return {
    unifiedId,
    entries,
    qualifiesAlone: 0,
    qualifiesAloneShare: entries > 0 ? 0 : null,
    covered: share === null ? 0 : Math.round(share * 100),
    share,
    reviewed: entries > 0,
    ...fields,
  }
}

function state(id: string, name: string, shares: (number | null)[] | null): OverviewState {
  return {
    id,
    slug: id.toLowerCase(),
    name,
    status: shares ? 'published' : 'none',
    hasList: shares !== null,
    cells: shares ? shares.map((s, i) => cell(i + 1, s)) : [],
  }
}

describe('coverage numbers and shades', () => {
  it.each([
    [null, 0, 'none'],
    [0, 0, 'none'],
    [0.001, 1, 'low'],
    [0.24, 24, 'low'],
    [0.245, 25, 'mid'],
    [0.5, 50, 'mid'],
    [0.744, 74, 'mid'],
    [0.75, 75, 'high'],
    [0.999, 99, 'high'],
    [1, 100, 'high'],
  ] as const)('share %s → %s percent, %s', (share, percent, band) => {
    expect(coveragePercent(share)).toBe(percent)
    expect(coverageBand(share)).toBe(band)
  })

  it('never shows 0% for a share above zero, nor 100% for one below one', () => {
    expect(overviewCellText(0.0004)).toBe('1%')
    expect(overviewCellText(0.9996)).toBe('99%')
    expect(overviewCellText(null)).toBe('0%')
  })

  it('marks a cell not reviewed only when it has codes', () => {
    expect(overviewCellNotReviewed(cell(1, 0.5, { reviewed: false }))).toBe(true)
    expect(overviewCellNotReviewed(cell(1, 0.5, { reviewed: true }))).toBe(false)
    expect(overviewCellNotReviewed(cell(1, 0))).toBe(false)
  })

  it('names a cell with its state, category, number and review', () => {
    const universe = category(1, { label: 'Serious mental illness' })
    const union = category(2, { label: 'Equipment', coverageBasis: 'union' })
    expect(overviewCellLabel('Georgia', universe, cell(1, 0.5, { reviewed: false }))).toBe(
      'Georgia, Serious mental illness: 50% of the category’s codes, not reviewed',
    )
    expect(overviewCellLabel('Montana', union, cell(2, 1))).toBe(
      'Montana, Equipment: 100% of the codes any state lists',
    )
    expect(overviewCellLabel('Montana', universe, cell(1, 0))).toBe(
      'Montana, Serious mental illness: 0%, none listed',
    )
    // Entries that cover none of the category's codes (HCPCS, say) are not "none listed".
    expect(overviewCellLabel('Louisiana', universe, cell(1, 0, { entries: 3 }))).toBe(
      'Louisiana, Serious mental illness: 0% of the category’s codes, not reviewed',
    )
  })

  it('links a cell to the category drill-down with the state in focus', () => {
    expect(overviewDrillDownPath('serious-mental-illness', 'GA')).toBe(
      '/compare/serious-mental-illness?focus=GA',
    )
  })
})

describe('overall coverage', () => {
  it('is the average of the category shares, each category counting the same', () => {
    expect(overviewOverall(state('GA', 'Georgia', [1, 0.5, 0]))).toBe(0.5)
    // A category with nothing to divide by (null) does not count.
    expect(overviewOverall(state('MT', 'Montana', [0.6, null]))).toBe(0.6)
  })

  it('is null without a list or without any share', () => {
    expect(overviewOverall(state('AL', 'Alabama', null))).toBeNull()
    expect(overviewOverall(state('MT', 'Montana', [null]))).toBeNull()
  })
})

describe('federal groups for the two-row header', () => {
  it('groups consecutive categories under their federal parent', () => {
    const groups = overviewCategoryGroups([
      category(1, { federalCategory: 'sud' }),
      category(2, { federalCategory: 'sud' }),
      category(3, { federalCategory: 'serious_complex_medical' }),
    ])
    expect(groups.map((g) => [g.label, g.categories.map((c) => c.id)])).toEqual([
      ['Substance use disorder', [1, 2]],
      ['Serious or complex medical condition', [3]],
    ])
  })
})

describe('ordering the states', () => {
  const categories = [category(1, { label: 'Psychoses' }), category(2, { label: 'Kidney' })]
  // Two clusters: {CO, GA} high on both, {MT, NE} high on 1 and low on 2. AL has no list.
  const states = [
    state('AL', 'Alabama', null),
    state('CO', 'Colorado', [0.9, 0.8]),
    state('GA', 'Georgia', [0.85, 0.9]),
    state('MT', 'Montana', [0.7, 0.1]),
    state('NE', 'Nebraska', [0.6, 0]),
    state('WY', 'Wyoming', null),
    state('AK', 'Alaska', [0.2, 0.75]),
  ]
  const ids = (order: OverviewOrder) => orderOverviewStates(states, order).map((s) => s.id)

  it('by name: states with a list first, then the rest, each by name', () => {
    expect(ids({ by: 'name' })).toEqual(['AK', 'CO', 'GA', 'MT', 'NE', 'AL', 'WY'])
  })

  it('by a column: highest first, then lowest first; states without a list stay last', () => {
    expect(ids({ by: 'category', unifiedId: 2, dir: 'desc' })).toEqual([
      'GA',
      'CO',
      'AK',
      'MT',
      'NE',
      'AL',
      'WY',
    ])
    expect(ids({ by: 'category', unifiedId: 2, dir: 'asc' })).toEqual([
      'NE',
      'MT',
      'AK',
      'CO',
      'GA',
      'AL',
      'WY',
    ])
  })

  it('by overall coverage, ties by name', () => {
    // CO 0.85, GA 0.875, AK 0.475, MT 0.4, NE 0.3
    expect(ids({ by: 'overall', dir: 'desc' })).toEqual(['GA', 'CO', 'AK', 'MT', 'NE', 'AL', 'WY'])
    const tied = [state('MT', 'Montana', [0.5, 0.5]), state('GA', 'Georgia', [1, 0])]
    expect(orderOverviewStates(tied, { by: 'overall', dir: 'desc' }).map((s) => s.id)).toEqual([
      'GA',
      'MT',
    ])
  })

  it('similar states together: greedy nearest neighbour from the highest overall', () => {
    // GA (highest overall) → CO (nearest to GA) → AK (0.2,0.75 is nearer to CO than MT is)
    // → MT → NE; then the states without a list by name.
    expect(ids({ by: 'similar' })).toEqual(['GA', 'CO', 'AK', 'MT', 'NE', 'AL', 'WY'])
    // Without AK the two clusters sit apart: GA, CO, then MT, NE.
    const fewer = states.filter((s) => s.id !== 'AK')
    expect(orderOverviewStates(fewer, { by: 'similar' }).map((s) => s.id)).toEqual([
      'GA',
      'CO',
      'MT',
      'NE',
      'AL',
      'WY',
    ])
  })

  it('a header click sorts highest first, and a second click flips it', () => {
    const first = nextOverviewOrder({ by: 'name' }, 2)
    expect(first).toEqual({ by: 'category', unifiedId: 2, dir: 'desc' })
    expect(nextOverviewOrder(first, 2)).toEqual({ by: 'category', unifiedId: 2, dir: 'asc' })
    expect(nextOverviewOrder(first, 'overall')).toEqual({ by: 'overall', dir: 'desc' })
    expect(nextOverviewOrder({ by: 'overall', dir: 'desc' }, 'overall')).toEqual({
      by: 'overall',
      dir: 'asc',
    })
  })

  it('announces each order in words', () => {
    expect(
      overviewOrderAnnouncement({ by: 'category', unifiedId: 2, dir: 'desc' }, categories),
    ).toBe('Sorted by Kidney, highest first.')
    expect(overviewOrderAnnouncement({ by: 'overall', dir: 'asc' }, categories)).toBe(
      'Sorted by overall coverage, lowest first.',
    )
    expect(overviewOrderAnnouncement({ by: 'name' }, categories)).toBe(
      'States in order of name, states with a list first.',
    )
    expect(overviewOrderAnnouncement({ by: 'similar' }, categories)).toBe(
      'States with similar coverage placed next to each other.',
    )
  })
})
