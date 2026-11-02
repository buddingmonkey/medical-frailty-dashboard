import { describe, expect, it } from 'vitest'

import {
  codeSystemSchema,
  federalCategories,
  federalCategorySchema,
  matchKindSchema,
  qualificationBasisSchema,
  qualificationSchema,
  stateStatusSchema,
  versionStatusSchema,
  watchKindSchema,
  watchStatusSchema,
} from './enums'

describe('shared enums (docs/data-model.md)', () => {
  it('lists the five statutory federal categories, then ours, in display order', () => {
    expect(federalCategories).toEqual([
      'blind_or_disabled',
      'sud',
      'disabling_mental_disorder',
      'physical_idd_adl',
      'serious_complex_medical',
      'state_specific',
      'unmapped',
    ])
  })

  it.each([
    [codeSystemSchema, 'icd10cm', 'ICD-10-CM'],
    [matchKindSchema, 'prefix', 'wildcard'],
    [qualificationSchema, 'needs_support', 'maybe'],
    [qualificationBasisSchema, 'inferred', 'guessed'],
    [stateStatusSchema, 'announced', 'live'],
    [versionStatusSchema, 'superseded', 'deleted'],
    [federalCategorySchema, 'sud', 'SUD'],
    [watchKindSchema, 'court', 'email'],
    [watchStatusSchema, 'dismissed', 'closed'],
  ])('accepts a known value and rejects an unknown one (%#)', (schema, good, bad) => {
    expect(schema.safeParse(good).success).toBe(true)
    expect(schema.safeParse(bad).success).toBe(false)
  })
})
