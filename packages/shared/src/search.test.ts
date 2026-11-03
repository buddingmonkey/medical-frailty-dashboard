import { describe, expect, it } from 'vitest'

import {
  CODE_SEARCH_MAX_LIMIT,
  CODE_SEARCH_MAX_TOKENS,
  codeSearchQuerySchema,
  ftsMatchExpression,
  parseSearchInput,
  searchTokens,
} from './search'

describe('codeSearchQuerySchema', () => {
  it('trims q and applies the defaults', () => {
    expect(codeSearchQuerySchema.parse({ q: '  F20  ' })).toEqual({
      q: 'F20',
      states: [],
      system: null,
      limit: 20,
    })
  })

  it.each([
    ['empty', ''],
    ['only spaces', '    '],
    ['over 100 characters', 'a'.repeat(101)],
  ])('refuses a q that is %s', (_, q) => {
    expect(codeSearchQuerySchema.safeParse({ q }).success).toBe(false)
  })

  it('accepts 100 characters and refuses a missing q', () => {
    expect(codeSearchQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true)
    expect(codeSearchQuerySchema.safeParse({}).success).toBe(false)
  })

  it('reads states as a comma list of slugs, any case, each once', () => {
    expect(codeSearchQuerySchema.parse({ q: 'x', states: 'ga, MT,ga,' }).states).toEqual([
      'ga',
      'mt',
    ])
    expect(codeSearchQuerySchema.parse({ q: 'x', states: '' }).states).toEqual([])
  })

  it.each(['georgia', 'g1', 'ga;mt', 'ga mt', `${'ga,'.repeat(60)}x`])(
    'refuses states=%s',
    (states) => {
      expect(codeSearchQuerySchema.safeParse({ q: 'x', states }).success).toBe(false)
    },
  )

  it('takes one code system and a limit with a cap', () => {
    const parsed = codeSearchQuerySchema.parse({ q: 'x', system: 'hcpcs', limit: '5' })
    expect([parsed.system, parsed.limit]).toEqual(['hcpcs', 5])
    expect(codeSearchQuerySchema.safeParse({ q: 'x', system: 'snomed' }).success).toBe(false)
    expect(codeSearchQuerySchema.safeParse({ q: 'x', limit: '0' }).success).toBe(false)
    expect(
      codeSearchQuerySchema.safeParse({ q: 'x', limit: String(CODE_SEARCH_MAX_LIMIT + 1) }).success,
    ).toBe(false)
    expect(codeSearchQuerySchema.safeParse({ q: 'x', limit: '2.5' }).success).toBe(false)
  })
})

describe('parseSearchInput', () => {
  it.each([
    ['F20', 'F20', null, 'icd10cm'],
    ['f20.0', 'F200', ['icd10cm'], 'icd10cm'],
    ['F20.', 'F20', ['icd10cm'], 'icd10cm'],
    ['J12.34', 'J1234', ['icd10cm'], 'icd10cm'],
    ['J1234', 'J1234', null, 'hcpcs'],
    ['j12', 'J12', null, 'icd10cm'],
    ['99213', '99213', null, 'cpt'],
    ['992', '992', null, 'revenue'],
    ['0001F', '0001F', null, 'cpt'],
    ['S14.111A', 'S14111A', ['icd10cm'], 'icd10cm'],
    ['QA0', 'QA0', null, 'icd10cm'],
  ])('reads %s as a code prefix', (q, prefix, systems, primary) => {
    expect(parseSearchInput(q)).toEqual({ kind: 'code', prefix, systems, primary })
  })

  it.each([
    'schizophrenia',
    'F20 paranoid',
    'covid19',
    'SMI',
    'F',
    'F20.0.1',
    'F2-0',
    '12345678901',
    'é1',
  ])('reads %s as words', (q) => {
    expect(parseSearchInput(q).kind).toBe('words')
  })
})

describe('searchTokens', () => {
  it('keeps letters and digits in any script, and splits on everything else', () => {
    expect(searchTokens('Paranoid  schizo-phrenia, F20.0')).toEqual([
      'paranoid',
      'schizo',
      'phrenia',
      'f20',
      '0',
    ])
    expect(searchTokens('Ménière’s disease')).toEqual(['ménière', 's', 'disease'])
    expect(searchTokens('糖尿病 2型')).toEqual(['糖尿病', '2型'])
  })

  it('drops FTS syntax and keeps at most a few tokens', () => {
    expect(CODE_SEARCH_MAX_TOKENS).toBe(8)
    expect(searchTokens('"a" OR b* NEAR(c, d) -e col:f ^g {h}')).toEqual([
      'a',
      'or',
      'b',
      'near',
      'c',
      'd',
      'e',
      'col',
    ])
    expect(searchTokens('*"():-^{}+')).toEqual([])
  })
})

describe('ftsMatchExpression', () => {
  it('quotes every token and makes the last one a prefix', () => {
    expect(ftsMatchExpression(['paranoid', 'schiz'], 'description')).toBe(
      'description : ("paranoid" "schiz"*)',
    )
  })

  it('leaves a one-character last token exact (a prefix of one letter costs too much)', () => {
    expect(ftsMatchExpression(['vitamin', 'd'], 'description')).toBe(
      'description : ("vitamin" "d")',
    )
  })

  it('turns operators into plain words', () => {
    expect(ftsMatchExpression(searchTokens('NOT near OR and'), 'd')).toBe(
      'd : ("not" "near" "or" "and"*)',
    )
  })

  it('is null without tokens', () => {
    expect(ftsMatchExpression([], 'description')).toBeNull()
  })
})
