import { describe, expect, it } from 'vitest'

import {
  categoryMappingSaveSchema,
  chosenFederalCategories,
  confirmedRules,
  federalCategoriesOf,
  federalCategoryList,
  federalRuleOf,
  federalRules,
  mappingKey,
  overrideSystems,
} from './category-mapping'
import { codeSystems, federalCategories } from './enums'

const noSystems = new Map<never, never>()

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
    expect(federalCategoriesOf(stated, ['sud'], mappings, chapters, noSystems)).toEqual([
      'physical_idd_adl',
      'serious_complex_medical',
    ])
    // An empty list is no statement: the other rules apply.
    expect(
      federalCategoriesOf(
        { ...stated, stateFederalCategories: [] },
        ['sud'],
        mappings,
        none,
        noSystems,
      ),
    ).toEqual(['sud'])
  })

  it('follows the federal parents of the unified categories the entry is placed in', () => {
    expect(federalCategoriesOf(entry('F200', 'Other'), ['sud'], mappings, none, noSystems)).toEqual(
      ['sud'],
    )
    // The placement wins over the state category's mapping and a chapter override.
    const chapters = new Map([[5, 'blind_or_disabled' as const]])
    expect(federalCategoriesOf(entry('F200'), ['sud'], mappings, chapters, noSystems)).toEqual([
      'sud',
    ])
  })

  it('counts a code in two unified categories with different parents under both, once each', () => {
    expect(
      federalCategoriesOf(
        entry('F200'),
        ['serious_complex_medical', 'disabling_mental_disorder', 'serious_complex_medical'],
        mappings,
        none,
        noSystems,
      ),
    ).toEqual(['disabling_mental_disorder', 'serious_complex_medical'])
  })

  it('falls back to the state category’s mapping when the entry is placed nowhere', () => {
    expect(federalCategoriesOf(entry('F200'), [], mappings, none, noSystems)).toEqual([
      'disabling_mental_disorder',
    ])
  })

  it('lets an ICD-10-CM chapter override win in the fallback (NE groups only by chapter)', () => {
    const chapters = new Map([[5, 'disabling_mental_disorder' as const]])
    expect(federalCategoriesOf(entry('F200', ''), [], mappings, chapters, noSystems)).toEqual([
      'disabling_mental_disorder',
    ])
    // Outside the chapter: the state default (the mapping of its blank category).
    expect(federalCategoriesOf(entry('C341', ''), [], mappings, chapters, noSystems)).toEqual([
      'serious_complex_medical',
    ])
  })

  it('never applies a chapter to a code that is not ICD-10-CM', () => {
    const chapters = new Map([[5, 'sud' as const]])
    expect(
      federalCategoriesOf(entry('F200', 'SMI', 'cpt' as never), [], mappings, chapters, noSystems),
    ).toEqual(['disabling_mental_disorder'])
  })

  it('is unmapped when nothing applies', () => {
    expect(federalCategoriesOf(entry('F200', 'Other'), [], mappings, none, noSystems)).toEqual([
      'unmapped',
    ])
  })
})

describe('federalRuleOf: suggestions by code', () => {
  const auto = new Map([[mappingKey('SMI', ''), 'disabling_mental_disorder' as const]])
  const none = new Map<number, never>()
  const suggested = (reviewed: boolean) => ({
    ...entry('E1065', 'SMI'),
    suggestion: {
      categories: ['serious_complex_medical' as const],
      reviewed,
      referenceNames: ['Indiana'],
    },
  })

  it('puts an unreviewed suggestion above an automatic mapping', () => {
    expect(federalRuleOf(suggested(false), [], auto, none, noSystems, new Set())).toEqual({
      rule: 'suggested',
      categories: ['serious_complex_medical'],
    })
  })

  it('puts a manual mapping above an unreviewed suggestion', () => {
    const manual = new Set([mappingKey('SMI', '')])
    expect(federalRuleOf(suggested(false), [], auto, none, noSystems, manual)).toEqual({
      rule: 'manual',
      categories: ['disabling_mental_disorder'],
    })
  })

  it('puts a reviewed suggestion above a manual mapping, below a chapter override', () => {
    const manual = new Set([mappingKey('SMI', '')])
    expect(federalRuleOf(suggested(true), [], auto, none, noSystems, manual).rule).toBe(
      'suggestedReviewed',
    )
    const chapters = new Map([[4, 'blind_or_disabled' as const]])
    expect(federalRuleOf(suggested(true), [], auto, chapters, noSystems, manual)).toEqual({
      rule: 'chapter',
      categories: ['blind_or_disabled'],
    })
  })

  it('lets placements and stated categories win over any suggestion', () => {
    expect(federalRuleOf(suggested(true), ['sud'], auto, none, noSystems, new Set()).rule).toBe(
      'placed',
    )
    expect(
      federalRuleOf(
        { ...suggested(true), stateFederalCategories: ['sud'] as const },
        [],
        auto,
        none,
        noSystems,
        new Set(),
      ).rule,
    ).toBe('stated')
  })

  it('counts every mapping as manual when the caller names none (a suggestion never beats it)', () => {
    expect(federalCategoriesOf(suggested(false), [], auto, none, noSystems)).toEqual([
      'disabling_mental_disorder',
    ])
    expect(federalRuleOf(suggested(false), [], new Map(), none, noSystems).rule).toBe('suggested')
  })

  it('names the auto and unmapped rules', () => {
    expect(federalRuleOf(entry('E1065', 'SMI'), [], auto, none, noSystems, new Set()).rule).toBe(
      'auto',
    )
    expect(federalRuleOf(entry('E1065', 'X'), [], auto, none, noSystems, new Set()).rule).toBe(
      'unmapped',
    )
  })
})

describe('federalRuleOf: code-system overrides', () => {
  // Connecticut published no categories: one blank category for every entry, whose NDC and
  // HCPCS entries are all addiction treatment.
  const blank = new Map([[mappingKey('', ''), 'serious_complex_medical' as const]])
  const manual = new Set([mappingKey('', '')])
  const none = new Map<number, never>()
  const systems = new Map([
    ['ndc' as const, 'sud' as const],
    ['hcpcs' as const, 'sud' as const],
  ])
  const ndc = {
    codeSystem: 'ndc' as const,
    codeNorm: '00093572001',
    stateCategory: '',
    stateSubcategory: '',
  }

  it('lets the override for the entry’s code system win over the category mapping', () => {
    expect(federalRuleOf(ndc, [], blank, none, systems, manual)).toEqual({
      rule: 'system',
      categories: ['sud'],
    })
    expect(
      federalRuleOf(
        { ...ndc, codeSystem: 'hcpcs', codeNorm: 'H0020' },
        [],
        blank,
        none,
        systems,
        manual,
      ).rule,
    ).toBe('system')
  })

  it('leaves other code systems to their own rules', () => {
    expect(
      federalRuleOf(
        { ...ndc, codeSystem: 'cpt', codeNorm: '99213' },
        [],
        blank,
        none,
        systems,
        manual,
      ),
    ).toEqual({
      rule: 'manual',
      categories: ['serious_complex_medical'],
    })
    // ICD-10-CM uses chapter overrides, never a code-system override.
    const icd = new Map([['icd10cm' as never, 'sud' as const]])
    expect(federalRuleOf(entry('F200', ''), [], blank, none, icd, manual).rule).toBe('manual')
  })

  it('ranks with the chapter override: below stated and placed, above a reviewed suggestion', () => {
    expect(
      federalRuleOf(
        { ...ndc, stateFederalCategories: ['physical_idd_adl'] as const },
        [],
        blank,
        none,
        systems,
      ).rule,
    ).toBe('stated')
    expect(federalRuleOf(ndc, ['blind_or_disabled'], blank, none, systems).rule).toBe('placed')
    const reviewed = {
      ...ndc,
      suggestion: { categories: ['blind_or_disabled' as const], reviewed: true },
    }
    expect(federalRuleOf(reviewed, [], blank, none, systems).rule).toBe('system')
  })

  it('lists every code system but ICD-10-CM, and every federal category but "unmapped"', () => {
    expect(overrideSystems).toEqual(codeSystems.filter((c) => c !== 'icd10cm'))
    expect(chosenFederalCategories).toEqual(federalCategories.filter((f) => f !== 'unmapped'))
  })

  it('counts as confirmed', () => {
    expect(confirmedRules.has('system')).toBe(true)
    expect(federalRules.indexOf('system')).toBe(federalRules.indexOf('chapter') + 1)
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
