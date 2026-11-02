import { describe, expect, it } from 'vitest'

import {
  categoryMappingSaveSchema,
  chapterOverrideSaveSchema,
  federalCategoryOf,
  mappingKey,
} from './category-mapping'

const entry = (codeNorm: string, stateCategory = 'SMI', codeSystem = 'icd10cm' as const) => ({
  codeSystem,
  codeNorm,
  stateCategory,
  stateSubcategory: '',
})

describe('federalCategoryOf', () => {
  const mappings = new Map([
    [mappingKey('SMI', ''), 'disabling_mental_disorder' as const],
    [mappingKey('', ''), 'serious_complex_medical' as const],
  ])

  it('uses the state category’s mapping', () => {
    expect(federalCategoryOf(entry('F200'), mappings, new Map())).toBe('disabling_mental_disorder')
  })

  it('lets an ICD-10-CM chapter override win (NE groups only by chapter)', () => {
    const chapters = new Map([[5, 'disabling_mental_disorder' as const]])
    expect(federalCategoryOf(entry('F200', ''), mappings, chapters)).toBe(
      'disabling_mental_disorder',
    )
    // Outside the chapter: the state default (the mapping of its blank category).
    expect(federalCategoryOf(entry('C341', ''), mappings, chapters)).toBe('serious_complex_medical')
  })

  it('never applies a chapter to a code that is not ICD-10-CM', () => {
    const chapters = new Map([[5, 'sud' as const]])
    expect(federalCategoryOf(entry('F200', 'SMI', 'cpt' as never), mappings, chapters)).toBe(
      'disabling_mental_disorder',
    )
  })

  it('is unmapped when nothing applies', () => {
    expect(federalCategoryOf(entry('F200', 'Other'), mappings, new Map())).toBe('unmapped')
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

  it('sets or clears a chapter override', () => {
    expect(chapterOverrideSaveSchema.parse({ federalCategory: null })).toEqual({
      federalCategory: null,
    })
    expect(chapterOverrideSaveSchema.safeParse({ federalCategory: 'nope' }).success).toBe(false)
  })
})
