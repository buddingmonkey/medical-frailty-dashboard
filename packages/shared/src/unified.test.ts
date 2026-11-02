import { describe, expect, it } from 'vitest'

import type { CodeSystem, MappingRelation, UnifiedMappingStatus, UnifiedStatus } from './enums'
import {
  type UnifiedMappingRow,
  type UnifiedOfContext,
  unifiedCategorySaveSchema,
  unifiedMappingSaveSchema,
  unifiedOf,
} from './unified'

// Unified categories (docs/data-model.md, "Unified categories (M5)"). Categories 1–5:
// 1 Serious mental illness (MBD001, MBD002), 2 Depression (MBD003),
// 3 Kidney failure (GEN003), 4 a draft (MBD001), 5 a retired one (MBD001).
const categories: UnifiedOfContext['categories'] = new Map<
  number,
  { status: UnifiedStatus; ccsr: ReadonlySet<string> }
>([
  [1, { status: 'published', ccsr: new Set(['MBD001', 'MBD002']) }],
  [2, { status: 'published', ccsr: new Set(['MBD003']) }],
  [3, { status: 'published', ccsr: new Set(['GEN003']) }],
  [4, { status: 'draft', ccsr: new Set(['MBD001']) }],
  [5, { status: 'retired', ccsr: new Set(['MBD001']) }],
])

function row(
  unifiedId: number | null,
  fields: Partial<{
    stateId: string
    stateCategory: string
    stateSubcategory: string
    relation: MappingRelation
    status: UnifiedMappingStatus
  }> = {},
): UnifiedMappingRow {
  return {
    stateId: fields.stateId ?? 'LA',
    stateCategory: fields.stateCategory ?? 'Serious Mental Illness',
    stateSubcategory: fields.stateSubcategory ?? '',
    unifiedId,
    relation: fields.relation ?? (unifiedId === null ? 'by_code' : 'exact'),
    status: fields.status ?? 'approved',
  }
}

const entry = (codeSystem: CodeSystem = 'icd10cm', stateCategory = 'Serious Mental Illness') => ({
  stateId: 'LA',
  codeSystem,
  stateCategory,
  stateSubcategory: '',
})

describe('unifiedOf', () => {
  it.each([
    {
      name: 'rule 2: one approved target → that one, whatever the CCSR',
      entry: entry(),
      mappings: [row(1)],
      entryCcsr: ['GEN003'],
      want: { unifiedIds: [1], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 2: several targets → those sharing a CCSR group with the entry',
      entry: entry(),
      mappings: [row(1, { relation: 'broad' }), row(2, { relation: 'broad' })],
      entryCcsr: ['MBD003'],
      want: { unifiedIds: [2], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 2: several targets, no CCSR match → all targets',
      entry: entry(),
      mappings: [row(2), row(1)],
      entryCcsr: ['GEN003'],
      want: { unifiedIds: [1, 2], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 2: several targets, CCSR unknown → all targets',
      entry: entry(),
      mappings: [row(1), row(2)],
      entryCcsr: [],
      want: { unifiedIds: [1, 2], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 2: several targets, not ICD-10-CM → all targets (CCSR ignored)',
      entry: entry('cpt'),
      mappings: [row(1), row(2)],
      entryCcsr: ['MBD003'],
      want: { unifiedIds: [1, 2], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 1: proposed and superseded rows are ignored (falls to by_code)',
      entry: entry(),
      mappings: [row(2, { status: 'proposed' }), row(3, { status: 'superseded' })],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [1], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 1: mappings of another state or category are ignored',
      entry: entry(),
      mappings: [row(2, { stateId: 'GA' }), row(3, { stateCategory: 'Dialysis' })],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [1], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 1: the state category matches ignoring case and outer spaces',
      entry: { ...entry(), stateCategory: '  serious mental ILLNESS ' },
      mappings: [row(2)],
      entryCcsr: [],
      want: { unifiedIds: [2], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 1: the subcategory is part of the key',
      entry: { ...entry(), stateSubcategory: 'Psychosis' },
      mappings: [row(2), row(3, { stateSubcategory: ' psychosis' })],
      entryCcsr: [],
      want: { unifiedIds: [3], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 3: approved by_code row → every category with the entry’s CCSR, reviewed',
      entry: entry(),
      mappings: [row(null)],
      entryCcsr: ['MBD003', 'GEN003'],
      want: { unifiedIds: [2, 3], basis: 'by_code', reviewed: true },
    },
    {
      name: 'rule 3: proposed by_code row does not count as reviewed',
      entry: entry(),
      mappings: [row(null, { status: 'proposed' })],
      entryCcsr: ['MBD003'],
      want: { unifiedIds: [2], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 3: no mapping → placed by CCSR, not reviewed',
      entry: entry(),
      mappings: [],
      entryCcsr: ['MBD002'],
      want: { unifiedIds: [1], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 3: no mapping and no CCSR match → none of them, still by_code',
      entry: entry(),
      mappings: [],
      entryCcsr: ['XXX000'],
      want: { unifiedIds: [], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 3: not ICD-10-CM and no mapping → none (Unclassified)',
      entry: entry('hcpcs'),
      mappings: [],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [], basis: 'none', reviewed: false },
    },
    {
      name: 'rule 3: not ICD-10-CM with an approved by_code row → none',
      entry: entry('ndc'),
      mappings: [row(null)],
      entryCcsr: [],
      want: { unifiedIds: [], basis: 'none', reviewed: false },
    },
    {
      name: 'rule 4: by_code skips draft and retired categories publicly',
      entry: entry(),
      mappings: [],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [1], basis: 'by_code', reviewed: false },
    },
    {
      name: 'rule 4: a mapping to a draft category counts nowhere publicly',
      entry: entry(),
      mappings: [row(4)],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 4: drafts are dropped after the CCSR filter, so publishing one only adds',
      entry: entry(),
      mappings: [row(4), row(2)],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [], basis: 'mapping', reviewed: true },
    },
    {
      name: 'rule 4: a mapping to a retired category never counts (falls to by_code)',
      entry: entry(),
      mappings: [row(5)],
      entryCcsr: ['MBD003'],
      want: { unifiedIds: [2], basis: 'by_code', reviewed: false },
    },
  ] as const)('$name', ({ entry: e, mappings, entryCcsr, want }) => {
    expect(unifiedOf(e, { mappings, categories, entryCcsr })).toEqual(want)
  })

  it.each([
    {
      name: 'includeDrafts: a mapping to a draft counts in the admin preview',
      mappings: [row(4), row(2)],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [4], basis: 'mapping', reviewed: true },
    },
    {
      name: 'includeDrafts: by_code places the entry in drafts too, never in retired ones',
      mappings: [],
      entryCcsr: ['MBD001'],
      want: { unifiedIds: [1, 4], basis: 'by_code', reviewed: false },
    },
  ] as const)('$name', ({ mappings, entryCcsr, want }) => {
    expect(unifiedOf(entry(), { mappings, categories, entryCcsr, includeDrafts: true })).toEqual(
      want,
    )
  })

  it('ignores mappings to categories it was not given', () => {
    expect(unifiedOf(entry(), { mappings: [row(99)], categories, entryCcsr: ['MBD003'] })).toEqual({
      unifiedIds: [2],
      basis: 'by_code',
      reviewed: false,
    })
  })
})

describe('unified schemas', () => {
  const category = {
    slug: 'serious-mental-illness',
    label: 'Serious mental illness',
    definition: 'Schizophrenia, bipolar disorder and other psychoses.',
    includes: null,
    excludes: null,
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 0,
    ccsr: ['MBD001', 'MBD002'],
  }

  it('accepts a unified category and rejects a bad slug or the unmapped parent', () => {
    expect(unifiedCategorySaveSchema.safeParse(category).success).toBe(true)
    for (const slug of ['Serious-Mental', 'smi illness', '-smi', 'smi-', 'smi--x', ''])
      expect(unifiedCategorySaveSchema.safeParse({ ...category, slug }).success).toBe(false)
    expect(
      unifiedCategorySaveSchema.safeParse({ ...category, federalCategory: 'unmapped' }).success,
    ).toBe(false)
  })

  const mapping = {
    stateCategory: 'Serious Mental Illness',
    stateSubcategory: '',
    unifiedId: 1,
    relation: 'exact',
    basis: 'state_text',
    confidence: 'high',
    rationale: 'The state’s heading names the same conditions.',
    citation: 'LA list, p. 2',
  }

  it('accepts a mapping, and ties by_code to an empty target', () => {
    expect(unifiedMappingSaveSchema.safeParse(mapping).success).toBe(true)
    expect(
      unifiedMappingSaveSchema.safeParse({ ...mapping, relation: 'by_code', unifiedId: null })
        .success,
    ).toBe(true)
    expect(unifiedMappingSaveSchema.safeParse({ ...mapping, relation: 'by_code' }).success).toBe(
      false,
    )
    expect(unifiedMappingSaveSchema.safeParse({ ...mapping, unifiedId: null }).success).toBe(false)
  })
})
