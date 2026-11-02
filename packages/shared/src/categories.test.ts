// One row per state category in docs/sources.md, as published.
import { describe, expect, it } from 'vitest'

import { autoMapCategory, federalCategoryInfo, normalizeCategoryLabel } from './categories'
import { federalCategories, type FederalCategory } from './enums'

describe('federalCategoryInfo', () => {
  it('describes every federal category, citing the statute for the five statutory ones', () => {
    for (const category of federalCategories) {
      expect(federalCategoryInfo[category].label).not.toBe('')
    }
    expect(federalCategoryInfo.physical_idd_adl.statuteClause).toBe('(dd)')
    expect(federalCategoryInfo.physical_idd_adl.statuteText).toBe(
      'with a physical, intellectual or developmental disability that significantly impairs their ability to perform 1 or more activities of daily living',
    )
    expect(federalCategoryInfo.unmapped.statuteClause).toBeNull()
  })
})

describe('normalizeCategoryLabel', () => {
  it('ignores case, spacing and punctuation differences between uploads', () => {
    expect(normalizeCategoryLabel('  Severe   Neurological ')).toBe('severe neurological')
    expect(normalizeCategoryLabel('SID-SDD-SPD')).toBe('sid sdd spd')
  })
})

describe('autoMapCategory', () => {
  it.each<[string, FederalCategory]>([
    // Louisiana categories
    ['SMI', 'disabling_mental_disorder'],
    ['SUD', 'sud'],
    ['IDD', 'physical_idd_adl'],
    ['Cancer', 'serious_complex_medical'],
    ['Severe diabetes', 'serious_complex_medical'],
    ['Severe neurological', 'serious_complex_medical'],
    ['Infectious disease', 'serious_complex_medical'],
    ['Immunodeficiency', 'serious_complex_medical'],
    ['Autoimmune', 'serious_complex_medical'],
    ['Transplant or ESRD', 'serious_complex_medical'],
    ['Temporary disabling', 'state_specific'], // not "blind or disabled"
    // Montana categories
    ['SCMC', 'serious_complex_medical'],
    ['DMD', 'disabling_mental_disorder'],
    ['SID-SDD-SPD', 'physical_idd_adl'],
    ['B', 'blind_or_disabled'],
    ['Impact on Ability to Work', 'state_specific'], // MT Tier 2
    ['Frailty indicators', 'state_specific'],
    // Wording close to the statute
    ['Substance use disorder', 'sud'],
    ['Disabling mental disorder', 'disabling_mental_disorder'],
    ['Blind or disabled', 'blind_or_disabled'],
    ['Developmental disability', 'physical_idd_adl'],
    ['Serious or complex medical condition', 'serious_complex_medical'],
  ])('%s -> %s', (label, federal) => {
    expect(autoMapCategory(label)?.federalCategory).toBe(federal)
  })

  it('leaves unknown categories unmapped (null) rather than guessing', () => {
    expect(autoMapCategory('Miscellaneous')).toBeNull()
    expect(autoMapCategory('')).toBeNull()
    expect(autoMapCategory('Bowel')).toBeNull() // "B" matches only as a whole label
  })

  it('reports the keyword it used and a confidence for the admin', () => {
    expect(autoMapCategory('SMI')).toEqual({
      federalCategory: 'disabling_mental_disorder',
      keyword: 'smi',
      confidence: 0.9,
    })
    expect(autoMapCategory('Severe diabetes')).toMatchObject({
      keyword: 'diabetes',
      confidence: 0.7,
    })
  })

  it('lowers the confidence when keywords point to different categories', () => {
    // "developmental" (physical_idd_adl) and "disability" (blind_or_disabled)
    expect(autoMapCategory('Developmental disability')).toMatchObject({
      federalCategory: 'physical_idd_adl',
      confidence: 0.5,
    })
  })

  it('uses the subcategory when the category alone says nothing', () => {
    expect(autoMapCategory('Tier 1 - DPHHS Approved Condition', 'SUD')?.federalCategory).toBe('sud')
  })
})
