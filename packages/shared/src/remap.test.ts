import { describe, expect, it } from 'vitest'

import { mappingKey } from './category-mapping'
import type { FederalCategory } from './enums'
import {
  previewRemap,
  type RemapEntry,
  remapChangeSentences,
  remapChangesSchema,
  remapSaveSchema,
} from './remap'

const entry = (
  rawCode: string,
  stateCategory: string,
  unifiedParents: FederalCategory[] = [],
  codeSystem: RemapEntry['codeSystem'] = 'icd10cm',
): RemapEntry => ({
  codeSystem,
  codeNorm: rawCode.replace('.', ''),
  rawCode,
  description: `Text of ${rawCode}`,
  stateCategory,
  stateSubcategory: '',
  unifiedParents,
})

// A state with SMI (F codes, one placed in a unified category), SUD, and a CPT code in SMI.
const entries = [
  entry('F20.0', 'SMI'),
  entry('F31.0', 'SMI'),
  entry('F32.0', 'SMI', ['serious_complex_medical']),
  entry('90837', 'SMI', [], 'cpt'),
  entry('F10.20', 'SUD'),
  entry('C50.9', 'Cancer'),
]
const mappings = new Map<string, FederalCategory>([
  [mappingKey('SMI', ''), 'disabling_mental_disorder'],
  [mappingKey('SUD', ''), 'sud'],
])

describe('previewRemap', () => {
  it('moves the unplaced entries of a category, and says which stay and why', () => {
    const preview = previewRemap({
      entries,
      mappings,
      chapterOverrides: new Map([[5, 'blind_or_disabled']]),
      changes: {
        categories: [{ stateCategory: 'smi ', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [],
      },
      draftGroups: [],
    })
    const [change] = preview.changes
    expect(change).toMatchObject({
      kind: 'category',
      stateCategory: 'smi ',
      to: 'sud',
      entries: 4,
      // F20.0 and F31.0 keep the chapter 5 override; F32.0 its unified placement; only the
      // CPT code follows the mapping.
      moves: [{ from: 'disabling_mental_disorder', to: 'sud', n: 1 }],
      already: 0,
      placed: { n: 1, federal: ['serious_complex_medical'] },
      chapterOverride: [{ chapter: 5, federalCategory: 'blind_or_disabled', n: 2 }],
      movingTotal: 1,
    })
    expect(change?.sample).toEqual([
      {
        code: '90837',
        description: 'Text of 90837',
        from: ['disabling_mental_disorder'],
        to: ['sud'],
      },
    ])
  })

  it('leaves entries whose state published their federal category where they are', () => {
    const preview = previewRemap({
      entries: [
        { ...entry('F20.0', 'SMI', ['serious_complex_medical']), stateFederalCategories: ['sud'] },
        entry('F31.0', 'SMI'),
      ],
      mappings,
      chapterOverrides: new Map(),
      changes: {
        categories: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [],
      },
      draftGroups: [],
    })
    const [change] = preview.changes
    expect(change).toMatchObject({
      entries: 2,
      stated: { n: 1, federal: ['sud'] },
      placed: { n: 0, federal: [] },
      movingTotal: 1,
    })
    expect(change && remapChangeSentences(change)).toContain(
      '1 stays in Substance use disorder because the state’s list names that federal category.',
    )
  })

  it('moves unreviewed suggestions to the new manual mapping, keeps reviewed ones', () => {
    const suggestion = (reviewed: boolean) => ({
      categories: ['serious_complex_medical' as const],
      reviewed,
      referenceNames: ['Indiana'],
    })
    const preview = previewRemap({
      entries: [
        { ...entry('E10.65', 'Diabetes'), suggestion: suggestion(false) },
        { ...entry('E11.65', 'Diabetes'), suggestion: suggestion(true) },
        entry('E13.65', 'Diabetes'),
      ],
      mappings: new Map([[mappingKey('Diabetes', ''), 'physical_idd_adl' as const]]),
      manualKeys: new Set(),
      chapterOverrides: new Map(),
      changes: {
        categories: [
          { stateCategory: 'Diabetes', stateSubcategory: '', federalCategory: 'physical_idd_adl' },
        ],
        chapters: [],
      },
      draftGroups: [],
    })
    const [change] = preview.changes
    expect(change).toMatchObject({
      entries: 3,
      // E10.65: its unreviewed suggestion beat the automatic mapping; the confirmed mapping wins.
      moves: [{ from: 'serious_complex_medical', to: 'physical_idd_adl', n: 1 }],
      already: 1,
      suggested: { n: 1, federal: ['serious_complex_medical'] },
    })
    expect(change && remapChangeSentences(change)).toContain(
      '1 stays in Serious or complex medical condition because an admin confirmed the suggestion from another state’s list.',
    )
  })

  it('counts entries already in the target, and the public totals before and after', () => {
    const preview = previewRemap({
      entries,
      mappings,
      chapterOverrides: new Map(),
      changes: {
        categories: [
          { stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' },
          { stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'sud' },
          {
            stateCategory: 'Cancer',
            stateSubcategory: '',
            federalCategory: 'serious_complex_medical',
          },
        ],
        chapters: [],
      },
      draftGroups: [],
    })
    expect(preview.changes.map((c) => [c.movingTotal, c.already])).toEqual([
      [3, 0],
      [0, 1],
      [1, 0],
    ])
    expect(preview.changes[2]?.moves).toEqual([
      { from: 'unmapped', to: 'serious_complex_medical', n: 1 },
    ])
    expect(preview.totals).toEqual([
      { federalCategory: 'sud', before: 1, after: 4 },
      { federalCategory: 'disabling_mental_disorder', before: 3, after: 0 },
      { federalCategory: 'serious_complex_medical', before: 1, after: 2 },
      { federalCategory: 'unmapped', before: 1, after: 0 },
    ])
  })

  it('applies a chapter override to unplaced ICD-10-CM entries only, and its removal', () => {
    const set = previewRemap({
      entries,
      mappings,
      chapterOverrides: new Map(),
      changes: { categories: [], chapters: [{ chapter: 5, federalCategory: 'blind_or_disabled' }] },
      draftGroups: [],
    })
    expect(set.changes[0]).toMatchObject({
      kind: 'chapter',
      chapter: 5,
      to: 'blind_or_disabled',
      entries: 4,
      moves: [
        { from: 'disabling_mental_disorder', to: 'blind_or_disabled', n: 2 },
        { from: 'sud', to: 'blind_or_disabled', n: 1 },
      ],
      placed: { n: 1, federal: ['serious_complex_medical'] },
      movingTotal: 3,
    })
    const cleared = previewRemap({
      entries,
      mappings,
      chapterOverrides: new Map([[5, 'blind_or_disabled']]),
      changes: { categories: [], chapters: [{ chapter: 5, federalCategory: null }] },
      draftGroups: [],
    })
    expect(cleared.changes[0]?.moves).toEqual([
      { from: 'blind_or_disabled', to: 'disabling_mental_disorder', n: 2 },
      { from: 'blind_or_disabled', to: 'sud', n: 1 },
    ])
  })

  it('caps the sample at 20 and keeps the total', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      entry(`9${String(1000 + i)}`, 'SMI', [], 'cpt'),
    )
    const preview = previewRemap({
      entries: many,
      mappings,
      chapterOverrides: new Map(),
      changes: {
        categories: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [],
      },
      draftGroups: [],
    })
    expect(preview.changes[0]?.sample).toHaveLength(20)
    expect(preview.changes[0]?.movingTotal).toBe(30)
  })

  it('counts the open drafts’ entries each change covers', () => {
    const preview = previewRemap({
      entries: [],
      mappings,
      chapterOverrides: new Map(),
      changes: {
        categories: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [{ chapter: 2, federalCategory: 'serious_complex_medical' }],
      },
      draftGroups: [
        { stateCategory: 'SMI', stateSubcategory: '', icd: 'F20', n: 4 },
        { stateCategory: 'SMI', stateSubcategory: '', icd: '', n: 1 },
        { stateCategory: 'Cancer', stateSubcategory: '', icd: 'C50', n: 7 },
      ],
    })
    expect(preview.changes.map((c) => c.draftEntries)).toEqual([5, 7])
  })
})

describe('remapChangeSentences', () => {
  it('says how many move, how many stay and why, and the drafts', () => {
    const preview = previewRemap({
      entries,
      mappings,
      chapterOverrides: new Map([[5, 'blind_or_disabled']]),
      changes: {
        categories: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [],
      },
      draftGroups: [{ stateCategory: 'SMI', stateSubcategory: '', icd: 'F20', n: 2 }],
    })
    const [change] = preview.changes
    if (!change) throw new Error('no change')
    expect(remapChangeSentences(change)).toEqual([
      '1 entry will move from Disabling mental disorder to Substance use disorder.',
      '1 stays in Serious or complex medical condition because it is placed in a published unified category.',
      '2 stay in Blind or disabled because the override for ICD-10-CM chapter 5 wins.',
      'And 2 entries in open drafts.',
    ])
  })

  it('says when nothing moves', () => {
    const preview = previewRemap({
      entries: [entry('F10.20', 'SUD')],
      mappings,
      chapterOverrides: new Map(),
      changes: {
        categories: [{ stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'sud' }],
        chapters: [],
      },
      draftGroups: [],
    })
    const [change] = preview.changes
    if (!change) throw new Error('no change')
    expect(remapChangeSentences(change)).toEqual([
      'No published entry changes federal category.',
      '1 is already in Substance use disorder.',
    ])
  })
})

describe('remap schemas', () => {
  const one = { stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }
  it('needs at least one change, no repeats, and never "unmapped"', () => {
    expect(remapChangesSchema.safeParse({ categories: [one], chapters: [] }).success).toBe(true)
    expect(remapChangesSchema.safeParse({ categories: [], chapters: [] }).success).toBe(false)
    expect(
      remapChangesSchema.safeParse({
        categories: [one, { ...one, stateCategory: ' smi' }],
        chapters: [],
      }).success,
    ).toBe(false)
    expect(
      remapChangesSchema.safeParse({
        categories: [{ ...one, federalCategory: 'unmapped' }],
        chapters: [],
      }).success,
    ).toBe(false)
    expect(
      remapChangesSchema.safeParse({
        categories: [],
        chapters: [{ chapter: 23, federalCategory: null }],
      }).success,
    ).toBe(false)
  })

  it('needs the preview token to save', () => {
    expect(remapSaveSchema.safeParse({ categories: [one], chapters: [] }).success).toBe(false)
    expect(
      remapSaveSchema.safeParse({ categories: [one], chapters: [], token: 'abc' }).success,
    ).toBe(true)
  })
})
