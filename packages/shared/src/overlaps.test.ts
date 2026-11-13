import { describe, expect, it } from 'vitest'

import {
  buildOverlaps,
  type OverlapInputRow,
  overlapRowText,
  overlapsCaption,
  overlapsResponseSchema,
  overlapStateHeaderText,
  overlapsVisible,
  OVERLAPS_TOP,
  overlapsToggleText,
} from './overlaps'

// The Overlaps view (project lead, 2026-11-12; UpSet, Lex et al. 2014): each row of the drill
// (a code, wildcard or range placed in the category) with the states that include it, by the
// drill's own matching, grouped into exclusive intersections.

const states = [
  { id: 'GA', slug: 'ga', name: 'Georgia' },
  { id: 'MT', slug: 'mt', name: 'Montana' },
  { id: 'NE', slug: 'ne', name: 'Nebraska' },
  { id: 'LA', slug: 'la', name: 'Louisiana' },
]

const row = (
  key: string,
  display: string,
  stateIds: string[],
  extra: Partial<OverlapInputRow> = {},
): OverlapInputRow => {
  const [system, kind, norm, end] = key.split('|')
  return {
    key,
    codeSystem: system === 'hcpcs' ? 'hcpcs' : 'icd10cm',
    codeNorm: norm ?? '',
    matchKind: kind === 'range' ? 'range' : kind === 'prefix' ? 'prefix' : 'exact',
    rangeEndNorm: end ?? null,
    display,
    codePath: kind === 'exact' ? `/codes/icd-10-cm/${display}` : null,
    stateIds,
    ...extra,
  }
}

// GA, MT and NE list something; LA lists nothing in the category.
const rows: OverlapInputRow[] = [
  // Listed by every state that lists anything here.
  row('icd10cm|exact|F200', 'F20.0', ['NE', 'GA', 'MT']),
  row('icd10cm|exact|F201', 'F20.1', ['GA', 'MT']),
  // A wildcard: GA lists it, MT covers it with a range of wildcards.
  row('icd10cm|prefix|F31', 'F31.*', ['MT', 'GA']),
  // A range only MT lists.
  row('icd10cm|range|F310|F319|', 'F31.0–F31.9', ['MT']),
  row('icd10cm|exact|F320', 'F32.0', ['MT']),
  row('icd10cm|exact|F330', 'F33.0', ['NE']),
]

describe('buildOverlaps', () => {
  const result = buildOverlaps(rows, states)

  it('gives each state that lists anything its set size, largest first, then by name', () => {
    expect(result.states.map((s) => [s.id, s.codeCount])).toEqual([
      ['MT', 5],
      ['GA', 3],
      ['NE', 2],
    ])
    expect(result.totalCodes).toBe(6)
  })

  it('puts each code in exactly one row: the exact set of states that include it', () => {
    expect(
      result.intersections.map((i) => [
        i.stateIds.join(','),
        i.size,
        i.codes.map((c) => c.display),
      ]),
    ).toEqual([
      ['GA,MT', 2, ['F20.1', 'F31.*']],
      ['MT', 2, ['F31.0–F31.9', 'F32.0']],
      ['GA,MT,NE', 1, ['F20.0']],
      ['NE', 1, ['F33.0']],
    ])
    const sizes = result.intersections.reduce((n, i) => n + i.size, 0)
    expect(sizes).toBe(result.totalCodes)
  })

  it('keeps each code’s key, system and page link (none for wildcards and ranges)', () => {
    const [first] = result.intersections
    expect(first?.codes).toEqual([
      {
        key: 'icd10cm|exact|F201',
        display: 'F20.1',
        codeSystem: 'icd10cm',
        codePath: '/codes/icd-10-cm/F20.1',
      },
      { key: 'icd10cm|prefix|F31', display: 'F31.*', codeSystem: 'icd10cm', codePath: null },
    ])
  })

  it('breaks ties in size by more states first, then by the states’ ids', () => {
    const tied = buildOverlaps(
      [
        row('icd10cm|exact|A000', 'A00.0', ['NE']),
        row('icd10cm|exact|A001', 'A00.1', ['GA']),
        row('icd10cm|exact|A002', 'A00.2', ['GA', 'NE']),
      ],
      states,
    )
    expect(tied.intersections.map((i) => i.stateIds.join(','))).toEqual(['GA,NE', 'GA', 'NE'])
  })

  it('ignores states it does not know and rows no state includes', () => {
    const odd = buildOverlaps(
      [row('icd10cm|exact|A000', 'A00.0', ['ZZ', 'GA']), row('icd10cm|exact|A001', 'A00.1', [])],
      states,
    )
    expect(odd.intersections.map((i) => i.stateIds)).toEqual([['GA']])
    expect(odd.totalCodes).toBe(1)
  })

  it('is empty when no state lists anything', () => {
    expect(buildOverlaps([], states)).toEqual({ states: [], totalCodes: 0, intersections: [] })
  })

  it('parses as the response body', () => {
    expect(
      overlapsResponseSchema.safeParse({
        dataVersion: 1,
        category: { id: 1, slug: 'psychoses', label: 'Psychoses', federalCategory: 'sud' },
        ...result,
      }).success,
    ).toBe(true)
  })
})

describe('overlap wording', () => {
  const names = new Map(states.map((s) => [s.id, s.name]))

  it('says each row in words, with the states’ names', () => {
    expect(overlapRowText({ size: 14, stateIds: ['GA', 'MT', 'NE'] }, names, 4)).toBe(
      '14 codes listed by exactly these 3 states: Georgia, Montana and Nebraska',
    )
    expect(overlapRowText({ size: 1, stateIds: ['GA', 'MT'] }, names, 4)).toBe(
      '1 code listed by exactly these 2 states: Georgia and Montana',
    )
    expect(overlapRowText({ size: 2, stateIds: ['MT'] }, names, 4)).toBe(
      '2 codes listed only by Montana',
    )
    expect(overlapRowText({ size: 1200, stateIds: ['GA', 'MT', 'NE'] }, names, 3)).toBe(
      '1,200 codes listed by all 3 states that list codes in this category',
    )
  })

  it('names the table, the state columns and the show-all control', () => {
    expect(overlapsCaption('Psychoses')).toBe(
      'Psychoses: groups of states that list exactly the same codes',
    )
    expect(overlapStateHeaderText('Georgia', 1)).toBe('Georgia, 1 code')
    expect(overlapStateHeaderText('Georgia', 1500)).toBe('Georgia, 1,500 codes')
    expect(overlapsToggleText(false, 31)).toBe('Show all 31 groups')
    expect(overlapsToggleText(true, 31)).toBe(`Show the top ${String(OVERLAPS_TOP)}`)
  })

  it('shows the top 20 rows until asked for all', () => {
    const many = Array.from({ length: 25 }, (_, i) => i)
    expect(overlapsVisible(many, false)).toHaveLength(20)
    expect(overlapsVisible(many, true)).toHaveLength(25)
  })
})
