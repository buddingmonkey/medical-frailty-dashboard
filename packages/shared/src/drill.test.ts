import { describe, expect, it } from 'vitest'

import {
  compareDrillGroups,
  compareDrillRows,
  drillCountText,
  drillCsvPath,
  drillFiledUnder,
  drillGroupCountText,
  drillKeeps,
  drillQueryFromRecord,
  drillRulesText,
  drillSearchParams,
  drillUniverseNote,
  parsePatternKey,
} from './drill'

// The category drill-down (roadmap M5 step 6): its URL, filters, order and wording.

describe('drillQueryFromRecord', () => {
  it('reads every option, defaults left out', () => {
    expect(drillQueryFromRecord({})).toEqual({
      show: 'all',
      system: null,
      all: false,
      focus: null,
      page: 1,
      code: null,
    })
    expect(
      drillQueryFromRecord({
        show: 'gaps',
        system: 'hcpcs',
        all: '1',
        focus: 'ga',
        page: '3',
        code: 'icd10cm|prefix|F31',
      }),
    ).toEqual({
      show: 'gaps',
      system: 'hcpcs',
      all: true,
      focus: 'GA',
      page: 3,
      code: 'icd10cm|prefix|F31',
    })
  })

  it('drops what it cannot read instead of failing, so an old link still opens', () => {
    expect(
      drillQueryFromRecord({
        show: 'most',
        system: 'icd9',
        all: 'yes',
        focus: 'Georgia',
        page: '-2',
        code: 'nonsense',
      }),
    ).toEqual({ show: 'all', system: null, all: false, focus: null, page: 1, code: null })
  })

  it('takes the first value of a repeated parameter', () => {
    expect(drillQueryFromRecord({ show: ['one', 'gaps'] }).show).toBe('one')
  })

  it('round-trips through drillSearchParams', () => {
    const q = drillQueryFromRecord({ show: 'one', all: '1', focus: 'MT', page: '2' })
    const params = drillSearchParams(q)
    expect(params.toString()).toBe('show=one&all=1&focus=MT&page=2')
    expect(drillQueryFromRecord(Object.fromEntries(params))).toEqual(q)
    expect(drillSearchParams(drillQueryFromRecord({})).toString()).toBe('')
  })

  it('builds the CSV link without page or code', () => {
    const q = drillQueryFromRecord({ show: 'gaps', page: '4', code: 'icd10cm|exact|F200' })
    expect(drillCsvPath('serious-mental-illness', q)).toBe(
      '/compare/serious-mental-illness/codes.csv?show=gaps',
    )
  })
})

describe('parsePatternKey', () => {
  it('reads codes, wildcards and ranges as comparePatternKey writes them', () => {
    expect(parsePatternKey('icd10cm|exact|F200')).toEqual({
      codeSystem: 'icd10cm',
      codeNorm: 'F200',
      matchKind: 'exact',
      rangeEndNorm: null,
      includesChildren: 0,
    })
    expect(parsePatternKey('icd10cm|prefix|F31')).toMatchObject({
      matchKind: 'prefix',
      includesChildren: 1,
    })
    expect(parsePatternKey('icd10cm|range|F31|F32|*')).toMatchObject({
      matchKind: 'range',
      codeNorm: 'F31',
      rangeEndNorm: 'F32',
      includesChildren: 1,
    })
    expect(parsePatternKey('cpt|range|90935|90937|')).toMatchObject({ includesChildren: 0 })
  })

  it('refuses anything else', () => {
    for (const bad of ['', 'icd10cm', 'icd9|exact|F200', 'icd10cm|exact|', 'icd10cm|range|F31']) {
      expect(parsePatternKey(bad)).toBeNull()
    }
  })
})

describe('filters', () => {
  it('keeps codes by how many of the states with a list list them', () => {
    // 4 states with a list.
    const kept = (show: Parameters<typeof drillKeeps>[0]) =>
      [0, 1, 2, 3, 4].filter((n) => drillKeeps(show, n, 4))
    expect(kept('all')).toEqual([0, 1, 2, 3, 4])
    expect(kept('everyone')).toEqual([4])
    expect(kept('gaps')).toEqual([0, 1])
    expect(kept('one')).toEqual([1])
    // Three states: under half is 0 or 1.
    expect([0, 1, 2].filter((n) => drillKeeps('gaps', n, 3))).toEqual([0, 1])
    // No state has a list: "everyone" keeps nothing.
    expect(drillKeeps('everyone', 0, 0)).toBe(false)
  })
})

describe('order', () => {
  const row = (codeNorm: string, count: number, codeSystem = 'icd10cm' as const) => ({
    codeSystem,
    codeNorm,
    matchKind: 'exact' as const,
    rangeEndNorm: null,
    count,
  })

  it('sorts codes by how many states list them, then by code', () => {
    const rows = [row('F209', 2), row('F200', 4), row('F201', 2), row('F20', 2)]
    rows.sort(compareDrillRows)
    expect(rows.map((r) => r.codeNorm)).toEqual(['F200', 'F20', 'F201', 'F209'])
  })

  it('puts a code before a wildcard and a range on the same code', () => {
    const rows = [
      { ...row('F31', 1), matchKind: 'range' as const, rangeEndNorm: 'F32' },
      { ...row('F31', 1), matchKind: 'prefix' as const },
      row('F31', 1),
    ]
    rows.sort(compareDrillRows)
    expect(rows.map((r) => r.matchKind)).toEqual(['exact', 'prefix', 'range'])
  })

  it('sorts groups by how many states list any code, then system, then key', () => {
    const groups = [
      { codeSystem: 'hcpcs' as const, key: 'hcpcs', anyCount: 2 },
      { codeSystem: 'icd10cm' as const, key: 'icd10cm|F31', anyCount: 2 },
      { codeSystem: 'icd10cm' as const, key: 'icd10cm|F20', anyCount: 2 },
      { codeSystem: 'icd10cm' as const, key: 'icd10cm|F32', anyCount: 3 },
    ]
    groups.sort(compareDrillGroups)
    expect(groups.map((g) => g.key)).toEqual(['icd10cm|F32', 'icd10cm|F20', 'icd10cm|F31', 'hcpcs'])
  })
})

describe('wording', () => {
  it('counts states', () => {
    expect(drillCountText(37, 44)).toBe('37 of 44 states')
    expect(drillCountText(1, 1)).toBe('1 of 1 state')
    expect(drillGroupCountText(3, 4)).toBe('3 of 4 list any')
  })

  it('summarises the states’ rules, inferred ones said so', () => {
    expect(
      drillRulesText([
        { qualification: 'standalone', count: 3, inferred: 1 },
        { qualification: 'unknown', count: 1, inferred: 0 },
      ]),
    ).toBe('Qualifies alone 3 (1 inferred); State doesn’t say 1')
    expect(drillRulesText([])).toBe('No state lists it')
  })

  it('names the state’s own category, if it has one', () => {
    expect(drillFiledUnder({ stateCategory: 'SMI', stateSubcategory: '' })).toBe('SMI')
    expect(drillFiledUnder({ stateCategory: 'Cancer', stateSubcategory: 'Lung' })).toBe(
      'Cancer › Lung',
    )
    expect(drillFiledUnder({ stateCategory: '', stateSubcategory: '' })).toBeNull()
  })

  it('says why codes no state lists can or cannot be shown', () => {
    expect(drillUniverseNote(158)).toBe(
      'Full code list: the 158 billable ICD-10-CM codes in the category’s CCSR groups.',
    )
    expect(drillUniverseNote(0)).toBe(
      'No full code list for this category, so only codes some state lists are shown.',
    )
  })
})
