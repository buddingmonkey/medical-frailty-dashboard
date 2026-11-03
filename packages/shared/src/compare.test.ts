import { describe, expect, it } from 'vitest'

import {
  buildCompare,
  compareCellText,
  compareFiledUnder,
  compareQualificationText,
  compareSubject,
  type CompareEntry,
  type CompareInput,
  compareQuerySchema,
  COMPARE_PAGE_SIZE,
  compareSearchParams,
  displayEntryCode,
  isCodeTableQuery,
} from './compare'

// Compare by category (roadmap M4 step 1): the query, the rows and each state's cell.

const entry = (
  stateId: string,
  codeNorm: string,
  patch: Partial<CompareEntry> = {},
): CompareEntry => ({
  stateId,
  codeSystem: 'icd10cm',
  codeNorm,
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: null,
  descriptionPublished: null,
  stateCategory: 'Mental health',
  stateSubcategory: '',
  federalCategories: ['disabling_mental_disorder'],
  tier: null,
  qualification: 'unknown',
  qualificationBasis: 'published',
  ...patch,
})

const states = [
  { id: 'GA', slug: 'ga', name: 'Georgia', published: true },
  { id: 'MT', slug: 'mt', name: 'Montana', published: true },
  { id: 'NE', slug: 'ne', name: 'Nebraska', published: false },
]

function input(entries: CompareEntry[], patch: Partial<CompareInput> = {}): CompareInput {
  return {
    states,
    entries,
    query: compareQuerySchema.parse({ states: 'GA,MT,NE', category: 'disabling_mental_disorder' }),
    ...patch,
  }
}

describe('compareQuerySchema', () => {
  it('reads states in any case, de-duplicated, in the order given', () => {
    const q = compareQuerySchema.parse({ states: 'mt, GA,mt', category: 'sud' })
    expect(q.states).toEqual(['MT', 'GA'])
    expect(q).toMatchObject({ category: 'sud', page: 1, alone: false })
    expect(q.system).toBeUndefined()
  })

  it("takes a state's own category instead of a federal one, and adds that state", () => {
    const q = compareQuerySchema.parse({
      states: 'GA',
      ownState: 'la',
      ownCategory: ' Behavioral Health ',
    })
    expect(q).toMatchObject({
      states: ['LA', 'GA'],
      ownState: 'LA',
      ownCategory: 'Behavioral Health',
      ownSubcategory: '',
    })
  })

  it('needs exactly one of category and ownState', () => {
    expect(compareQuerySchema.safeParse({ states: 'GA' }).success).toBe(false)
    expect(
      compareQuerySchema.safeParse({
        states: 'GA',
        category: 'sud',
        ownState: 'GA',
        ownCategory: 'x',
      }).success,
    ).toBe(false)
    expect(compareQuerySchema.safeParse({ states: 'GA', ownState: 'GA' }).success).toBe(false)
  })

  it('refuses bad states, categories, systems and pages', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const tooMany = [...letters.map((l) => `A${l}`), ...letters.map((l) => `B${l}`)].join(',')
    for (const bad of [
      { states: '', category: 'sud' },
      { states: 'GAA', category: 'sud' },
      { states: 'GA', category: 'cancer' },
      { states: 'GA', category: 'sud', system: 'snomed' },
      { states: 'GA', category: 'sud', page: '0' },
      { states: 'GA', category: 'sud', alone: 'maybe' },
      { states: tooMany, category: 'sud' },
    ]) {
      expect(compareQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('round-trips through URL search params', () => {
    const q = compareQuerySchema.parse({
      states: 'GA,MT',
      category: 'sud',
      system: 'icd10cm',
      alone: '1',
      page: '3',
    })
    const params = compareSearchParams(q)
    expect(params.toString()).toBe('states=GA%2CMT&category=sud&system=icd10cm&alone=1&page=3')
    expect(compareQuerySchema.parse(Object.fromEntries(params))).toEqual(q)
  })

  it('leaves defaults out of the URL', () => {
    const q = compareQuerySchema.parse({ states: 'GA', ownState: 'GA', ownCategory: 'Cancer' })
    expect(compareSearchParams(q).toString()).toBe('states=GA&ownState=GA&ownCategory=Cancer')
  })
})

describe('displayEntryCode', () => {
  it('shows codes, wildcards and ranges the way people write them', () => {
    expect(displayEntryCode(entry('GA', 'F200'))).toBe('F20.0')
    expect(displayEntryCode(entry('GA', 'F10', { matchKind: 'prefix' }))).toBe('F10.*')
    expect(displayEntryCode(entry('GA', 'F10', { includesChildren: 1 }))).toBe('F10.*')
    expect(
      displayEntryCode(
        entry('GA', 'F41', { matchKind: 'range', rangeEndNorm: 'F42', includesChildren: 1 }),
      ),
    ).toBe('F41.*–F42.*')
    expect(
      displayEntryCode(
        entry('GA', '32851', { codeSystem: 'cpt', matchKind: 'range', rangeEndNorm: '32854' }),
      ),
    ).toBe('32851–32854')
    expect(displayEntryCode(entry('GA', 'E', { codeSystem: 'hcpcs', matchKind: 'prefix' }))).toBe(
      'E*',
    )
  })
})

describe('buildCompare', () => {
  it('makes one row per code the selected states list in the category, sorted by code', () => {
    const result = buildCompare(
      input([
        entry('MT', 'F200'),
        entry('GA', 'F200'),
        entry('GA', 'F10', { matchKind: 'prefix' }),
        entry('GA', 'C50', { federalCategories: ['serious_complex_medical'] }),
        entry('LA', 'F319'), // not selected
      ]),
    )
    expect(result.rows.map((r) => r.display)).toEqual(['F10.*', 'F20.0'])
    expect(result).toMatchObject({ totalRows: 2, page: 1, pageCount: 1 })
  })

  it('shows a code under two federal categories in either category’s table', () => {
    const both = entry('GA', 'F31', {
      matchKind: 'prefix',
      federalCategories: ['disabling_mental_disorder', 'serious_complex_medical'],
    })
    const rows = (category: 'disabling_mental_disorder' | 'serious_complex_medical' | 'sud') =>
      buildCompare({ ...input([both]), query: { ...input([]).query, category } }).rows.map(
        (r) => r.display,
      )
    expect(rows('disabling_mental_disorder')).toEqual(['F31.*'])
    expect(rows('serious_complex_medical')).toEqual(['F31.*'])
    expect(rows('sud')).toEqual([])
  })

  it('marks each cell exact, covered, narrower, not listed or no list', () => {
    const result = buildCompare(
      input([
        entry('GA', 'F200', { tier: 'A', qualification: 'standalone' }),
        entry('GA', 'F10', { matchKind: 'prefix' }),
        entry('MT', 'F20', {
          matchKind: 'prefix',
          stateCategory: 'SMI',
          qualification: 'needs_support',
          qualificationBasis: 'inferred',
        }),
        entry('MT', 'F1020'),
      ]),
    )
    const f10 = result.rows.find((r) => r.display === 'F10.*')
    const f200 = result.rows.find((r) => r.display === 'F20.0')
    expect(f10?.cells.map((c) => c.status)).toEqual(['exact', 'narrower', 'no_list'])
    expect(f10?.cells[1]).toMatchObject({ status: 'narrower', narrowerCount: 1 })
    expect(f200?.cells.map((c) => c.status)).toEqual(['exact', 'covered', 'no_list'])
    expect(f200?.cells[0]?.match).toEqual({
      display: 'F20.0',
      tier: 'A',
      qualification: 'standalone',
      qualificationBasis: 'published',
      stateCategory: 'Mental health',
      stateSubcategory: '',
      federalCategories: ['disabling_mental_disorder'],
    })
    expect(f200?.cells[1]?.match).toMatchObject({
      display: 'F20.*',
      stateCategory: 'SMI',
      qualification: 'needs_support',
      qualificationBasis: 'inferred',
    })
  })

  it("looks through the state's whole list, so a code under another category still counts", () => {
    const result = buildCompare(
      input([
        entry('GA', 'F200'),
        entry('MT', 'F200', { federalCategories: ['unmapped'], stateCategory: '' }),
      ]),
    )
    expect(result.rows[0]?.cells[1]).toMatchObject({
      status: 'exact',
      match: { federalCategories: ['unmapped'] },
    })
  })

  it('reads ranges and wildcard ranges like entryCovers does', () => {
    const result = buildCompare(
      input(
        [
          entry('GA', '32852', { codeSystem: 'cpt' }),
          entry('GA', 'F411'),
          entry('MT', '32851', { codeSystem: 'cpt', matchKind: 'range', rangeEndNorm: '32854' }),
          entry('MT', 'F41', { matchKind: 'range', rangeEndNorm: 'F42', includesChildren: 1 }),
        ],
        {
          states: states.slice(0, 2),
          query: compareQuerySchema.parse({
            states: 'GA,MT',
            category: 'disabling_mental_disorder',
          }),
        },
      ),
    )
    const byCode = new Map(result.rows.map((r) => [r.display, r.cells.map((c) => c.status)]))
    expect(byCode.get('32852')).toEqual(['exact', 'covered'])
    expect(byCode.get('F41.1')).toEqual(['exact', 'covered'])
    expect(byCode.get('32851–32854')).toEqual(['narrower', 'exact'])
    expect(byCode.get('F41.*–F42.*')).toEqual(['narrower', 'exact'])
  })

  it('does not let a single code cover a wildcard of the same characters', () => {
    const result = buildCompare(
      input([entry('GA', 'F10', { matchKind: 'prefix' }), entry('MT', 'F10')], {
        states: states.slice(0, 2),
        query: compareQuerySchema.parse({ states: 'GA,MT', category: 'disabling_mental_disorder' }),
      }),
    )
    const wildcard = result.rows.find((r) => r.display === 'F10.*')
    expect(wildcard?.cells[1]?.status).toBe('narrower')
  })

  it('prefers the exact entry, then the one that qualifies alone, when a state has several', () => {
    const result = buildCompare(
      input([
        entry('GA', 'F200'),
        entry('MT', 'F2', { matchKind: 'prefix', qualification: 'standalone' }),
        entry('MT', 'F200', { tier: 'Tier 2', qualification: 'needs_support' }),
        entry('MT', 'F200', { tier: 'Tier 1', qualification: 'standalone' }),
      ]),
    )
    expect(result.rows.find((r) => r.display === 'F20.0')?.cells[1]).toMatchObject({
      status: 'exact',
      match: { tier: 'Tier 1', qualification: 'standalone' },
    })
  })

  it("compares a state's own category by its label, case and spaces ignored", () => {
    const result = buildCompare(
      input(
        [
          entry('MT', 'F200', { stateCategory: 'SMI ' }),
          entry('MT', 'F319', { stateCategory: 'Other' }),
          entry('GA', 'F200', { stateCategory: 'smi' }),
        ],
        { query: compareQuerySchema.parse({ states: 'GA', ownState: 'MT', ownCategory: 'smi' }) },
      ),
    )
    expect(result.rows.map((r) => r.display)).toEqual(['F20.0'])
    expect(result.states.map((s) => s.id)).toEqual(['MT', 'GA'])
  })

  it('filters by code system and to codes that qualify alone in at least one state', () => {
    const entries = [
      entry('GA', 'F200', { qualification: 'standalone' }),
      entry('MT', 'F319', { qualification: 'needs_support' }),
      entry('GA', 'H0001', { codeSystem: 'hcpcs' }),
    ]
    expect(
      buildCompare(
        input(entries, {
          query: compareQuerySchema.parse({
            states: 'GA,MT',
            category: 'disabling_mental_disorder',
            system: 'hcpcs',
          }),
        }),
      ).rows.map((r) => r.display),
    ).toEqual(['H0001'])
    expect(
      buildCompare(
        input(entries, {
          query: compareQuerySchema.parse({
            states: 'GA,MT',
            category: 'disabling_mental_disorder',
            alone: '1',
          }),
        }),
      ).rows.map((r) => r.display),
    ).toEqual(['F20.0'])
  })

  it('pages the rows and clamps a page past the end', () => {
    const many = Array.from({ length: COMPARE_PAGE_SIZE + 5 }, (_, i) =>
      entry('GA', `F${String(100 + i)}`),
    )
    const second = buildCompare(
      input(many, {
        query: compareQuerySchema.parse({
          states: 'GA',
          category: 'disabling_mental_disorder',
          page: '2',
        }),
      }),
    )
    expect(second).toMatchObject({ totalRows: COMPARE_PAGE_SIZE + 5, page: 2, pageCount: 2 })
    expect(second.rows).toHaveLength(5)
    const past = buildCompare(
      input(many, {
        query: compareQuerySchema.parse({
          states: 'GA',
          category: 'disabling_mental_disorder',
          page: '9',
        }),
      }),
    )
    expect(past.page).toBe(2)
    const all = buildCompare(input(many), { allRows: true })
    expect(all.rows).toHaveLength(COMPARE_PAGE_SIZE + 5)
  })

  it("takes the row's description from the first state that published one", () => {
    const result = buildCompare(
      input([
        entry('MT', '90791', {
          codeSystem: 'cpt',
          descriptionPublished: 'Psych diagnostic evaluation',
        }),
        entry('GA', '90791', { codeSystem: 'cpt' }),
      ]),
    )
    expect(result.rows[0]).toMatchObject({
      description: 'Psych diagnostic evaluation',
      descriptionSource: 'MT',
    })
  })
})

describe('compare wording', () => {
  const match = {
    display: 'F20.*',
    tier: null,
    qualification: 'needs_support' as const,
    qualificationBasis: 'inferred' as const,
    stateCategory: 'SMI',
    stateSubcategory: '',
    federalCategories: ['disabling_mental_disorder' as const],
  }

  it('says what each cell means in a few words', () => {
    expect(compareCellText({ status: 'exact', match, narrowerCount: 0 })).toBe('Listed')
    expect(compareCellText({ status: 'covered', match, narrowerCount: 0 })).toBe('Covered by F20.*')
    expect(compareCellText({ status: 'narrower', match: null, narrowerCount: 1 })).toBe(
      '1 narrower code listed',
    )
    expect(compareCellText({ status: 'narrower', match: null, narrowerCount: 4 })).toBe(
      '4 narrower codes listed',
    )
    expect(compareCellText({ status: 'no_list', match: null, narrowerCount: 0 })).toBe(
      'No list on this site',
    )
    expect(compareQualificationText(match)).toBe('Needs another code or documentation (inferred)')
    expect(compareQualificationText({ ...match, qualificationBasis: 'published' })).toBe(
      'Needs another code or documentation',
    )
  })

  it('names the category only when it is not the one being compared', () => {
    expect(
      compareFiledUnder({ category: 'disabling_mental_disorder', ownSubcategory: '' }, 'MT', match),
    ).toBeNull()
    expect(compareFiledUnder({ category: 'sud', ownSubcategory: '' }, 'MT', match)).toBe('SMI')
    expect(
      compareFiledUnder({ category: 'sud', ownSubcategory: '' }, 'GA', {
        ...match,
        stateCategory: '',
      }),
    ).toBe('Disabling mental disorder')
    // A code under two federal categories is in either one's table, and names both elsewhere.
    const both = {
      ...match,
      stateCategory: '',
      federalCategories: ['disabling_mental_disorder' as const, 'serious_complex_medical' as const],
    }
    expect(
      compareFiledUnder({ category: 'serious_complex_medical', ownSubcategory: '' }, 'GA', both),
    ).toBeNull()
    expect(compareFiledUnder({ category: 'sud', ownSubcategory: '' }, 'GA', both)).toBe(
      'Disabling mental disorder; Serious or complex medical condition',
    )
    const own = { ownState: 'MT', ownCategory: 'smi', ownSubcategory: '' }
    expect(compareFiledUnder(own, 'MT', match)).toBeNull()
    expect(compareFiledUnder(own, 'GA', match)).toBe('SMI')
  })

  it('names what is compared', () => {
    const name = (id: string) => (id === 'MT' ? 'Montana' : id)
    expect(compareSubject({ category: 'sud', ownSubcategory: '' }, name)).toBe(
      'Substance use disorder',
    )
    expect(
      compareSubject({ ownState: 'MT', ownCategory: 'Cancer', ownSubcategory: 'Solid' }, name),
    ).toBe('Montana: Cancer › Solid')
  })
})

describe('the code table moved to /compare/codes (M5 step 5)', () => {
  it('recognises a code-table query, so /compare can redirect it', () => {
    expect(isCodeTableQuery(new URLSearchParams('states=GA&category=sud'))).toBe(true)
    expect(isCodeTableQuery(new URLSearchParams('ownState=MT&ownCategory=SMI'))).toBe(true)
    expect(isCodeTableQuery(new URLSearchParams('page=2'))).toBe(true)
    expect(isCodeTableQuery(new URLSearchParams(''))).toBe(false)
    expect(isCodeTableQuery(new URLSearchParams('utm_source=x'))).toBe(false)
  })
})
