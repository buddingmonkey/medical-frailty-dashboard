import { describe, expect, it } from 'vitest'

import { CODE_SEARCH_NOT_LISTED } from './search'
import {
  SEARCH_MIN_CHARS,
  searchCountText,
  searchEmptyText,
  searchListedByText,
  searchPageParams,
  searchPageQuery,
  searchReady,
  searchTextBy,
} from './search-page'

// The search page (roadmap M6 step 2): the URL, when to search, and the words.

describe('searchPageQuery', () => {
  it('reads q, states and system from the URL', () => {
    expect(searchPageQuery({ q: 'schiz', states: 'ga,MT', system: 'icd10cm' })).toEqual({
      q: 'schiz',
      states: ['ga', 'mt'],
      system: 'icd10cm',
    })
  })

  it('drops what it cannot read', () => {
    expect(searchPageQuery({ q: ['a', 'b'], states: 'ga,zzz,,ga', system: 'nope' })).toEqual({
      q: 'a',
      states: ['ga'],
      system: null,
    })
    expect(searchPageQuery({})).toEqual({ q: '', states: [], system: null })
  })

  it('trims q and caps it at the API limit', () => {
    expect(searchPageQuery({ q: '  F20  ' }).q).toBe('F20')
    expect(searchPageQuery({ q: 'x'.repeat(150) }).q).toHaveLength(100)
  })
})

describe('searchPageParams', () => {
  it('writes only what is set, so the URL stays short', () => {
    expect(searchPageParams({ q: ' F20 ', states: [], system: null })).toEqual({ q: 'F20' })
    expect(searchPageParams({ q: '', states: ['ga', 'mt'], system: 'hcpcs' })).toEqual({
      states: 'ga,mt',
      system: 'hcpcs',
    })
  })

  it('round-trips through searchPageQuery', () => {
    const query = { q: 'paranoid', states: ['ga'], system: 'icd10cm' as const }
    expect(searchPageQuery(searchPageParams(query))).toEqual(query)
  })
})

describe('searchReady', () => {
  it(`searches from ${String(SEARCH_MIN_CHARS)} characters`, () => {
    expect(searchReady('F')).toBe(false)
    expect(searchReady(' F ')).toBe(false)
    expect(searchReady('F2')).toBe(true)
  })
})

describe('wording', () => {
  it('counts results, and says when there may be more', () => {
    expect(searchCountText(1, 20)).toBe('1 code found.')
    expect(searchCountText(7, 20)).toBe('7 codes found.')
    expect(searchCountText(20, 20)).toMatch(/^Showing the first 20 codes\. .*narrow/)
  })

  it('says what to try when nothing matches', () => {
    expect(searchEmptyText('xyzzy', false)).toBe(
      'No codes match “xyzzy”. Try a code number like F20.0, or a word like schizophrenia.',
    )
    expect(searchEmptyText('xyzzy', true)).toContain('remove a filter')
  })

  it('names the state whose text is shown', () => {
    expect(searchTextBy('Georgia')).toBe('Text published by Georgia')
  })

  it('says how many of the states with a list on this site list the code', () => {
    expect(searchListedByText(0, 4, [])).toBe(`${CODE_SEARCH_NOT_LISTED}.`)
    expect(searchListedByText(2, 4, ['Georgia', 'Montana'])).toBe(
      'Listed by 2 of 4 states with a list on this site: Georgia, Montana.',
    )
    expect(searchListedByText(1, 1, ['Montana'])).toBe(
      'Listed by 1 of 1 state with a list on this site: Montana.',
    )
    // Before the state list loads: no total, no names.
    expect(searchListedByText(3, null, [])).toBe('Listed by 3 states on this site.')
  })
})
