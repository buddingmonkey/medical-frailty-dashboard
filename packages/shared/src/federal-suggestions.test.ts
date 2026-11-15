import { describe, expect, it } from 'vitest'

import {
  buildSuggestionReference,
  CHAPTER_MIN_CODES,
  CHAPTER_MIN_SHARE,
  decodeSuggestion,
  diffSuggestions,
  SUGGESTION_EXCLUDED_CHAPTERS,
  suggestFederal,
  suggestionFromText,
  type SuggestionReferenceRow,
} from './federal-suggestions'
import type { LawCategory } from './state-federal'

const ref = (codeNorm: string, ...categories: LawCategory[]): SuggestionReferenceRow => ({
  stateId: 'IN',
  stateName: 'Indiana',
  codeNorm,
  categories,
})
const icd = (codeNorm: string, matchKind: 'exact' | 'prefix' | 'range' = 'exact') => ({
  codeSystem: 'icd10cm' as const,
  codeNorm,
  matchKind,
})

describe('suggestFederal', () => {
  it('uses the exact code first', () => {
    const reference = buildSuggestionReference([
      ref('E1065', 'serious_complex_medical'),
      ref('E1100', 'physical_idd_adl'),
      ref('E1101', 'physical_idd_adl'),
    ])
    expect(suggestFederal(icd('E1065'), reference)).toEqual({
      categories: ['serious_complex_medical'],
      level: 'exact',
      referenceStateIds: ['IN'],
    })
  })

  it('unions the categories of several reference states for the same code', () => {
    const reference = buildSuggestionReference([
      ref('G35', 'serious_complex_medical'),
      { stateId: 'OH', stateName: 'Ohio', codeNorm: 'G35', categories: ['physical_idd_adl'] },
    ])
    expect(suggestFederal(icd('G35'), reference)).toEqual({
      categories: ['physical_idd_adl', 'serious_complex_medical'],
      level: 'exact',
      referenceStateIds: ['IN', 'OH'],
    })
  })

  it('falls back to the most common category of the 3-character category', () => {
    const reference = buildSuggestionReference([
      ref('G800', 'physical_idd_adl'),
      ref('G801', 'physical_idd_adl'),
      ref('G802', 'serious_complex_medical'),
    ])
    expect(suggestFederal(icd('G809'), reference)).toMatchObject({
      categories: ['physical_idd_adl'],
      level: 'category3',
    })
  })

  it('unions the tied categories of a 3-character category', () => {
    const reference = buildSuggestionReference([
      ref('G800', 'physical_idd_adl'),
      ref('G802', 'serious_complex_medical'),
    ])
    expect(suggestFederal(icd('G809'), reference)?.categories).toEqual([
      'physical_idd_adl',
      'serious_complex_medical',
    ])
  })

  it('treats a wildcard or a range by its own code, then its 3-character category', () => {
    const reference = buildSuggestionReference([ref('C340', 'serious_complex_medical')])
    expect(suggestFederal(icd('C34', 'prefix'), reference)?.level).toBe('category3')
    expect(suggestFederal(icd('C341', 'range'), reference)?.level).toBe('category3')
  })

  it('uses the chapter only when it is large and nearly unanimous', () => {
    const many = Array.from({ length: CHAPTER_MIN_CODES }, (_, i) =>
      ref(`C${String(10 + i)}0`, 'serious_complex_medical'),
    )
    const reference = buildSuggestionReference(many)
    expect(suggestFederal(icd('C800'), reference)).toMatchObject({
      categories: ['serious_complex_medical'],
      level: 'chapter',
    })
    // One code fewer than the minimum: nothing.
    const few = buildSuggestionReference(many.slice(1))
    expect(suggestFederal(icd('C800'), few)).toBeNull()
  })

  it('needs the share of the chapter', () => {
    const n = CHAPTER_MIN_CODES * 2
    const split = Math.floor(n * CHAPTER_MIN_SHARE) - 1
    const rows = Array.from({ length: n }, (_, i) =>
      ref(`C${String(10 + i)}0`, i < split ? 'serious_complex_medical' : 'physical_idd_adl'),
    )
    expect(suggestFederal(icd('C800'), buildSuggestionReference(rows))).toBeNull()
  })

  it('never suggests by chapter for chapter 5 (mental and behavioural)', () => {
    expect(SUGGESTION_EXCLUDED_CHAPTERS).toContain(5)
    const rows = Array.from({ length: 40 }, (_, i) => ref(`F1${String(i).padStart(2, '0')}`, 'sud'))
    const reference = buildSuggestionReference(rows)
    expect(suggestFederal(icd('F200'), reference)).toBeNull()
    // The 3-character level still applies inside chapter 5.
    expect(suggestFederal(icd('F1099'), reference)?.level).toBe('category3')
  })

  it('suggests nothing for other code systems or with no reference', () => {
    const reference = buildSuggestionReference([ref('J0000', 'sud')])
    expect(
      suggestFederal({ codeSystem: 'hcpcs', codeNorm: 'J0000', matchKind: 'exact' }, reference),
    ).toBeNull()
    expect(suggestFederal(icd('E1065'), buildSuggestionReference([]))).toBeNull()
  })
})

describe('suggestion text', () => {
  it('decodes the packed SQL text', () => {
    expect(decodeSuggestion(null)).toBeNull()
    expect(decodeSuggestion('sud|0|Indiana;serious_complex_medical|1|Indiana')).toEqual({
      categories: ['sud', 'serious_complex_medical'],
      reviewed: false,
      referenceNames: ['Indiana'],
    })
    expect(decodeSuggestion('sud|1|Indiana')?.reviewed).toBe(true)
    expect(decodeSuggestion('nonsense')).toBeNull()
  })

  it('names the reference states', () => {
    expect(suggestionFromText(['Indiana'])).toBe('suggested from Indiana’s list')
    expect(suggestionFromText(['Indiana', 'Ohio'])).toBe(
      'suggested from Indiana’s and Ohio’s lists',
    )
  })
})

describe('diffSuggestions', () => {
  it('counts gains, changes and losses, and keeps reviewed entries', () => {
    const diff = diffSuggestions(
      [
        { entryId: 1, code: 'A', description: null, reviewed: false, before: [], after: ['sud'] },
        {
          entryId: 2,
          code: 'B',
          description: null,
          reviewed: false,
          before: ['sud'],
          after: ['physical_idd_adl'],
        },
        { entryId: 3, code: 'C', description: null, reviewed: false, before: ['sud'], after: [] },
        { entryId: 4, code: 'D', description: null, reviewed: true, before: ['sud'], after: [] },
        {
          entryId: 5,
          code: 'E',
          description: null,
          reviewed: false,
          before: ['sud'],
          after: ['sud'],
        },
      ],
      20,
    )
    expect(diff.gain).toBe(1)
    expect(diff.change).toBe(1)
    expect(diff.lose).toBe(1)
    expect(diff.unchanged).toBe(1)
    expect(diff.keptReviewed).toBe(1)
    expect(diff.byCategory).toEqual([
      { federalCategory: 'sud', gain: 1, lose: 2 },
      { federalCategory: 'physical_idd_adl', gain: 1, lose: 0 },
    ])
    expect(diff.sample.map((s) => s.code)).toEqual(['A', 'B', 'C'])
  })
})
