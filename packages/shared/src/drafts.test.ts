import { describe, expect, it } from 'vitest'

import {
  type DraftEntry,
  draftRowsRequestSchema,
  findNamedStates,
  toDraftEntries,
  validateDraftEntry,
} from './drafts'
import type { MappedRow } from './ingest'
import { buildReview } from './review'

const row = (rawCode: string, extra: Partial<MappedRow> = {}): MappedRow => ({
  locator: `row ${rawCode}`,
  rawCode,
  codeSystemHint: '',
  description: 'A condition',
  category: 'SMI',
  subcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  qualificationValue: '',
  included: true,
  notes: '',
  stateFederal: '',
  ...extra,
})

const entry = (patch: Partial<DraftEntry> = {}): DraftEntry => ({
  codeSystem: 'icd10cm',
  rawCode: 'F20.0',
  codeNorm: 'F200',
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: 0,
  descriptionPublished: 'Schizophrenia',
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  sourceLocator: 'row 2',
  attributes: { included: true, flags: [] },
  ...patch,
})

describe('toDraftEntries', () => {
  it('makes one entry per code, skips dropped rows and counts rows that cannot be read', () => {
    const review = buildReview(
      [
        row('33230 and 33240', { locator: 'a', qualificationValue: '0', notes: 'Why' }),
        row('SMI', { locator: 'b' }),
        row('F20', { locator: 'c' }),
        row('F31.0', { locator: 'd' }),
      ],
      { d: { dropped: true } },
      { undottedIcd: false },
    )
    const { entries, invalidRowCount } = toDraftEntries(review)
    expect(invalidRowCount).toBe(1)
    expect(entries.map((e) => [e.rawCode, e.codeNorm, e.sourceLocator])).toEqual([
      ['33230', '33230', 'a'],
      ['33240', '33240', 'a'],
      ['F20', 'F20', 'c'],
    ])
    expect(entries[0]).toMatchObject({
      codeSystem: 'cpt',
      descriptionPublished: 'A condition',
      attributes: { included: true, flags: [], notes: 'Why', qualificationValue: '0' },
    })
    // The open category question travels with the entry, for the checks.
    expect(entries[2]).toMatchObject({
      includesChildren: null,
      attributes: { flags: ['category_scope'] },
    })
  })

  it('carries the state’s own federal categories, and leaves them out when there are none', () => {
    const review = buildReview(
      [
        row('F20.0', { stateFederal: 'Serious or complex medical condition; Blind or disabled' }),
        row('F20.1'),
        row('F20.2', { stateFederal: 'Unknown words' }),
      ],
      {},
      { undottedIcd: false },
    )
    const { entries } = toDraftEntries(review)
    expect(entries.map((e) => e.stateFederalCategories)).toEqual([
      ['blind_or_disabled', 'serious_complex_medical'],
      undefined,
      undefined,
    ])
    // The unanswered question travels with the entry, like the others.
    expect(entries[2]?.attributes.flags).toEqual(['state_federal_unknown'])
    expect(
      draftRowsRequestSchema.safeParse({ sourceDocumentId: 1, part: 'p', entries }).success,
    ).toBe(true)
  })

  it('accepts only the five law categories, each once, from the browser', () => {
    const send = (stateFederalCategories: unknown) =>
      draftRowsRequestSchema.safeParse({
        sourceDocumentId: 1,
        part: 'p',
        entries: [{ ...entry(), stateFederalCategories }],
      }).success
    expect(send(['sud'])).toBe(true)
    expect(send(undefined)).toBe(true)
    expect(send(['unmapped'])).toBe(false)
    expect(send(['sud', 'sud'])).toBe(false)
  })

  it('stores an empty description as null and keeps excluded rows marked', () => {
    const review = buildReview(
      [row('F20.0', { description: '', included: false })],
      {},
      {
        undottedIcd: false,
      },
    )
    expect(toDraftEntries(review).entries[0]).toMatchObject({
      descriptionPublished: null,
      attributes: { included: false },
    })
  })
})

describe('validateDraftEntry', () => {
  it('accepts an entry whose code reads the same in its code system', () => {
    expect(validateDraftEntry(entry())).toBeNull()
    expect(
      validateDraftEntry(entry({ rawCode: 'A0103', codeNorm: 'A0103', codeSystem: 'icd10cm' })),
    ).toBeNull()
    expect(
      validateDraftEntry(
        entry({
          rawCode: 'M30-M31.*',
          codeNorm: 'M30',
          matchKind: 'range',
          rangeEndNorm: 'M31',
          includesChildren: 1,
        }),
      ),
    ).toBeNull()
  })

  it('refuses a code that does not match its parsed form', () => {
    expect(validateDraftEntry(entry({ codeNorm: 'F201' }))).toContain('does not match')
    expect(validateDraftEntry(entry({ rawCode: 'SMI', codeNorm: 'SMI' }))).toContain('not a code')
    expect(validateDraftEntry(entry({ rawCode: 'F20.0, F20.1' }))).toContain('one code')
  })
})

describe('draftRowsRequestSchema', () => {
  it('takes at most 500 entries', () => {
    const entries = Array.from({ length: 501 }, () => entry())
    expect(
      draftRowsRequestSchema.safeParse({ sourceDocumentId: 1, part: 'Sheet1', entries }).success,
    ).toBe(false)
    expect(
      draftRowsRequestSchema.safeParse({
        sourceDocumentId: 1,
        part: 'Sheet1',
        entries: entries.slice(1),
      }).success,
    ).toBe(true)
  })
})

describe('findNamedStates', () => {
  const states = [
    { id: 'AR', name: 'Arkansas' },
    { id: 'KS', name: 'Kansas' },
    { id: 'MT', name: 'Montana' },
    { id: 'VA', name: 'Virginia' },
    { id: 'WV', name: 'West Virginia' },
  ]

  it('finds whole state names in titles and headers', () => {
    expect(findNamedStates(['DPHHS Montana Medically Frail Condition List'], states)).toEqual([
      'MT',
    ])
  })

  it('does not read Kansas in Arkansas or Virginia in West Virginia', () => {
    expect(findNamedStates(['Arkansas list', 'West Virginia'], states)).toEqual(['AR', 'WV'])
  })

  it('ignores case and returns nothing when no state is named', () => {
    expect(findNamedStates(['MONTANA'], states)).toEqual(['MT'])
    expect(findNamedStates(['Code', 'Description'], states)).toEqual([])
  })
})
