import { describe, expect, it } from 'vitest'

import {
  parseStatesPair,
  similarityText,
  statesCompareAllLabel,
  statesCompareCaption,
  statesCompareCsvPath,
  statesCompareDiffers,
  statesComparePath,
  statesCompareQueryFromRecord,
  statesCompareSearchParams,
  statesCompareSummaryText,
  statesCompareTitle,
} from './states-compare'
import { pageTitles } from './public'
import { isReservedUnifiedSlug } from './unified'

// Compare 2–4 states (roadmap M5 step 7): the URL, the "differs" rule and the words.

describe('parseStatesPair', () => {
  it('reads 2 to 4 lowercase postal codes in column order', () => {
    expect(parseStatesPair('ga-vs-la')).toEqual(['GA', 'LA'])
    expect(parseStatesPair('la-vs-ga')).toEqual(['LA', 'GA'])
    expect(parseStatesPair('ne-vs-ga-vs-mt-vs-la')).toEqual(['NE', 'GA', 'MT', 'LA'])
  })

  it('refuses one state, five, repeats, capitals and other spellings', () => {
    for (const bad of [
      'ga',
      'ga-vs',
      'ga-vs-la-vs-mt-vs-ne-vs-tx',
      'ga-vs-ga',
      'GA-vs-LA',
      'ga-and-la',
      'ga-vs-l1',
      'gaa-vs-la',
      '',
      'ga--vs-la',
    ]) {
      expect(parseStatesPair(bad), bad).toBeNull()
    }
  })
})

describe('statesComparePath', () => {
  it('writes the path and only a non-default query', () => {
    expect(statesComparePath(['GA', 'LA'])).toBe('/compare/states/ga-vs-la')
    expect(statesComparePath(['NE', 'GA', 'MT'], { diff: false })).toBe(
      '/compare/states/ne-vs-ga-vs-mt?diff=0',
    )
    expect(statesComparePath(['GA', 'LA'], { diff: true, page: 3 })).toBe(
      '/compare/states/ga-vs-la?page=3',
    )
    expect(statesCompareCsvPath(['GA', 'LA'])).toBe('/compare/states/ga-vs-la/codes.csv')
  })

  it('reserves "states" as a unified category slug', () => {
    expect(isReservedUnifiedSlug('states')).toBe(true)
    expect(isReservedUnifiedSlug('codes')).toBe(true)
  })
})

describe('statesCompareQueryFromRecord', () => {
  it('reads diff and page leniently; diff defaults to on', () => {
    expect(statesCompareQueryFromRecord({})).toEqual({ diff: true, page: 1 })
    expect(statesCompareQueryFromRecord({ diff: '0', page: '2' })).toEqual({ diff: false, page: 2 })
    expect(statesCompareQueryFromRecord({ diff: ['0', '1'], page: 'x' })).toEqual({
      diff: false,
      page: 1,
    })
    expect(statesCompareQueryFromRecord({ diff: 'maybe' })).toEqual({ diff: true, page: 1 })
    expect(statesCompareSearchParams({ diff: true, page: 1 }).toString()).toBe('')
  })
})

describe('statesCompareDiffers', () => {
  const listed = (qualification: 'standalone' | 'needs_support' | 'unknown') => ({
    status: 'exact' as const,
    match: { qualification },
  })
  const covered = (qualification: 'standalone' | 'needs_support') => ({
    status: 'covered' as const,
    match: { qualification },
  })
  const none = { status: 'not_listed' as const, match: null }
  const narrower = { status: 'narrower' as const, match: null }

  it("does not count a rule the state doesn't state as a disagreement", () => {
    expect(statesCompareDiffers([listed('standalone'), listed('unknown')])).toBe(false)
    expect(statesCompareDiffers([listed('unknown'), listed('unknown')])).toBe(false)
    expect(
      statesCompareDiffers([listed('standalone'), listed('needs_support'), listed('unknown')]),
    ).toBe(true)
  })

  it('differs when the states disagree on listed-or-covered', () => {
    expect(statesCompareDiffers([listed('standalone'), none])).toBe(true)
    expect(statesCompareDiffers([covered('standalone'), narrower])).toBe(true)
    expect(statesCompareDiffers([listed('standalone'), listed('standalone'), none])).toBe(true)
  })

  it('does not differ when all list or cover it under the same rule', () => {
    expect(statesCompareDiffers([listed('standalone'), covered('standalone')])).toBe(false)
    expect(
      statesCompareDiffers([
        listed('needs_support'),
        listed('needs_support'),
        covered('needs_support'),
      ]),
    ).toBe(false)
  })

  it('differs when all list it but under different rules', () => {
    expect(statesCompareDiffers([listed('standalone'), covered('needs_support')])).toBe(true)
  })
})

describe('words', () => {
  it('titles the page with the state names', () => {
    expect(statesCompareTitle(['Georgia', 'Louisiana'])).toBe(
      pageTitles.statesCompare('Georgia vs Louisiana'),
    )
    expect(pageTitles.statesCompare('Georgia vs Louisiana')).toMatch(
      /^Georgia vs Louisiana medical frailty codes \| /,
    )
  })

  it('writes the similarity with two decimals', () => {
    expect(similarityText(0.60537)).toBe('0.61')
    expect(similarityText(0)).toBe('0.00')
    expect(similarityText(1)).toBe('1.00')
  })

  it('says how many codes differ and the page', () => {
    expect(
      statesCompareSummaryText({
        totalRows: 12,
        totalGroups: 2,
        page: 1,
        pageCount: 1,
        diff: true,
      }),
    ).toBe('12 codes differ, in 2 groups.')
    expect(
      statesCompareSummaryText({
        totalRows: 1,
        totalGroups: 1,
        page: 2,
        pageCount: 3,
        diff: false,
      }),
    ).toBe('1 code, in 1 group, page 2 of 3.')
  })

  it('captions the table and labels the summary', () => {
    expect(statesCompareCaption(['Georgia', 'Montana'], true)).toBe(
      'Codes where Georgia and Montana differ',
    )
    expect(statesCompareCaption(['Georgia', 'Montana', 'Nebraska'], false)).toBe(
      'Every code of Georgia, Montana and Nebraska',
    )
    expect(statesCompareAllLabel(2)).toBe('Both')
    expect(statesCompareAllLabel(3)).toBe('All 3')
  })
})
