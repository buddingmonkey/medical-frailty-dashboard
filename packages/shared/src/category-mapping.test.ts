import { describe, expect, it } from 'vitest'

import {
  categoryMappingSaveSchema,
  federalCategoriesOf,
  federalCategoryList,
  mappingKey,
} from './category-mapping'

const entry = (codeNorm: string, stateCategory = 'SMI', codeSystem = 'icd10cm' as const) => ({
  codeSystem,
  codeNorm,
  stateCategory,
  stateSubcategory: '',
})

describe('federalCategoriesOf', () => {
  const mappings = new Map([
    [mappingKey('SMI', ''), 'disabling_mental_disorder' as const],
    [mappingKey('', ''), 'serious_complex_medical' as const],
  ])
  const none = new Map<number, never>()

  it('counts an entry the state gave federal categories under exactly those, first of all', () => {
    const stated = {
      ...entry('F200', 'SMI'),
      stateFederalCategories: ['physical_idd_adl', 'serious_complex_medical'] as const,
    }
    const chapters = new Map([[5, 'blind_or_disabled' as const]])
    // Ahead of placements, the state category's mapping and a chapter override.
    expect(federalCategoriesOf(stated, ['sud'], mappings, chapters)).toEqual([
      'physical_idd_adl',
      'serious_complex_medical',
    ])
    // An empty list is no statement: the other rules apply.
    expect(
      federalCategoriesOf({ ...stated, stateFederalCategories: [] }, ['sud'], mappings, none),
    ).toEqual(['sud'])
  })

  it('follows the federal parents of the unified categories the entry is placed in', () => {
    expect(federalCategoriesOf(entry('F200', 'Other'), ['sud'], mappings, none)).toEqual(['sud'])
    // The placement wins over the state category's mapping and a chapter override.
    const chapters = new Map([[5, 'blind_or_disabled' as const]])
    expect(federalCategoriesOf(entry('F200'), ['sud'], mappings, chapters)).toEqual(['sud'])
  })

  it('counts a code in two unified categories with different parents under both, once each', () => {
    expect(
      federalCategoriesOf(
        entry('F200'),
        ['serious_complex_medical', 'disabling_mental_disorder', 'serious_complex_medical'],
        mappings,
        none,
      ),
    ).toEqual(['disabling_mental_disorder', 'serious_complex_medical'])
  })

  it('falls back to the state category’s mapping when the entry is placed nowhere', () => {
    expect(federalCategoriesOf(entry('F200'), [], mappings, none)).toEqual([
      'disabling_mental_disorder',
    ])
  })

  it('lets an ICD-10-CM chapter override win in the fallback (NE groups only by chapter)', () => {
    const chapters = new Map([[5, 'disabling_mental_disorder' as const]])
    expect(federalCategoriesOf(entry('F200', ''), [], mappings, chapters)).toEqual([
      'disabling_mental_disorder',
    ])
    // Outside the chapter: the state default (the mapping of its blank category).
    expect(federalCategoriesOf(entry('C341', ''), [], mappings, chapters)).toEqual([
      'serious_complex_medical',
    ])
  })

  it('never applies a chapter to a code that is not ICD-10-CM', () => {
    const chapters = new Map([[5, 'sud' as const]])
    expect(
      federalCategoriesOf(entry('F200', 'SMI', 'cpt' as never), [], mappings, chapters),
    ).toEqual(['disabling_mental_disorder'])
  })

  it('is unmapped when nothing applies', () => {
    expect(federalCategoriesOf(entry('F200', 'Other'), [], mappings, none)).toEqual(['unmapped'])
  })
})

describe('federalCategoryList', () => {
  it('reads the comma-separated parents SQL returns, keeping known values only', () => {
    expect(federalCategoryList(null)).toEqual([])
    expect(federalCategoryList('')).toEqual([])
    expect(federalCategoryList('sud,disabling_mental_disorder,nope')).toEqual([
      'sud',
      'disabling_mental_disorder',
    ])
  })
})

describe('mappingKey', () => {
  it('ignores case and spacing, as the database rows are written', () => {
    expect(mappingKey(' smi ', '')).toBe(mappingKey('SMI', ''))
  })
})

describe('schemas', () => {
  it('saves up to 200 mappings at once, never as "unmapped"', () => {
    const item = { stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }
    expect(categoryMappingSaveSchema.safeParse({ items: [item] }).success).toBe(true)
    expect(
      categoryMappingSaveSchema.safeParse({ items: [{ ...item, federalCategory: 'unmapped' }] })
        .success,
    ).toBe(false)
    expect(
      categoryMappingSaveSchema.safeParse({ items: Array.from({ length: 201 }, () => item) })
        .success,
    ).toBe(false)
  })
})
