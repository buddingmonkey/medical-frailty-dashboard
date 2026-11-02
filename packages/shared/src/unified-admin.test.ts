import { describe, expect, it } from 'vitest'

import {
  unifiedCategoryBodySchema,
  unifiedMappingApproveSchema,
  unifiedMappingPutSchema,
  unifiedSlugFromLabel,
  unifiedStatusChangeAllowed,
  unifiedSuggestion,
  unifiedVersionChanges,
} from './unified-admin'

describe('unifiedSlugFromLabel', () => {
  it.each([
    ['Serious mental illness', 'serious-mental-illness'],
    ['Kidney failure & dialysis', 'kidney-failure-dialysis'],
    ['  HIV/AIDS  ', 'hiv-aids'],
    ['Substance use (SUD)', 'substance-use-sud'],
    ['Épilepsie', 'epilepsie'],
    ['!!!', ''],
  ])('%s → %s', (label, slug) => {
    expect(unifiedSlugFromLabel(label)).toBe(slug)
  })

  it('stays within 80 characters and never ends with a hyphen', () => {
    const slug = unifiedSlugFromLabel(`${'a'.repeat(79)} b`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('unifiedCategoryBodySchema', () => {
  const body = {
    label: 'Serious mental illness',
    definition: 'Psychotic and major mood disorders.',
    federalCategory: 'disabling_mental_disorder',
  }

  it('fills the defaults: no slug (the API makes one), draft, no CCSR groups', () => {
    expect(unifiedCategoryBodySchema.parse(body)).toEqual({
      ...body,
      includes: null,
      excludes: null,
      sortOrder: 0,
      status: 'draft',
      ccsr: [],
    })
  })

  it.each([
    ['an empty label', { label: ' ' }],
    ['a bad slug', { slug: 'Serious Mental' }],
    ['"unmapped" as parent', { federalCategory: 'unmapped' }],
    ['a bad CCSR id', { ccsr: ['mbd001'] }],
    ['a negative sort order', { sortOrder: -1 }],
    ['an unknown status', { status: 'deleted' }],
  ])('refuses %s', (_, change) => {
    expect(unifiedCategoryBodySchema.safeParse({ ...body, ...change }).success).toBe(false)
  })
})

describe('unifiedStatusChangeAllowed', () => {
  it.each([
    ['draft', 'draft', true],
    ['draft', 'published', true],
    ['draft', 'retired', false],
    ['published', 'retired', true],
    ['published', 'draft', false],
    ['retired', 'published', true],
    ['retired', 'draft', false],
    ['retired', 'retired', true],
  ] as const)('%s → %s: %s', (from, to, allowed) => {
    expect(unifiedStatusChangeAllowed(from, to)).toBe(allowed)
  })
})

describe('unifiedVersionChanges', () => {
  const before = { label: 'A', definition: 'B', includes: null, excludes: 'E' }

  it('is true when label, definition, includes or excludes change', () => {
    expect(unifiedVersionChanges(before, { ...before, label: 'A2' })).toBe(true)
    expect(unifiedVersionChanges(before, { ...before, includes: 'I' })).toBe(true)
    expect(unifiedVersionChanges(before, { ...before, excludes: null })).toBe(true)
  })

  it('is false when only other fields change', () => {
    expect(unifiedVersionChanges(before, { ...before })).toBe(false)
  })
})

describe('unifiedMappingPutSchema', () => {
  const key = { stateCategory: 'SMI', stateSubcategory: '', approve: false }
  const target = { unifiedId: 1, relation: 'exact', basis: 'state_text', confidence: 'high' }

  it('takes one or more targets', () => {
    expect(unifiedMappingPutSchema.parse({ ...key, targets: [target] })).toMatchObject({
      targets: [{ ...target, rationale: null, citation: null }],
    })
  })

  it('takes by_code, with the basis and confidence defaulted', () => {
    expect(unifiedMappingPutSchema.parse({ ...key, byCode: true })).toMatchObject({
      byCode: true,
      basis: 'admin_judgement',
      confidence: 'high',
    })
  })

  it.each([
    ['no targets', { targets: [] }],
    ['duplicate targets', { targets: [target, { ...target, relation: 'close' }] }],
    ['by_code as a target relation', { targets: [{ ...target, relation: 'by_code' }] }],
    ['by_code with targets', { byCode: true, targets: [target] }],
    ['neither', {}],
    ['byCode: false', { byCode: false }],
  ])('refuses %s', (_, change) => {
    expect(unifiedMappingPutSchema.safeParse({ ...key, ...change }).success).toBe(false)
  })

  it('needs approve', () => {
    expect(
      unifiedMappingPutSchema.safeParse({
        stateCategory: 'SMI',
        stateSubcategory: '',
        byCode: true,
      }).success,
    ).toBe(false)
    expect(
      unifiedMappingApproveSchema.safeParse({ stateCategory: 'SMI', stateSubcategory: '' }).success,
    ).toBe(true)
  })
})

describe('unifiedSuggestion', () => {
  const categories = [
    { id: 1, label: 'Serious mental illness', status: 'published' as const, ccsr: ['MBD002'] },
    { id: 2, label: 'Mood disorders', status: 'draft' as const, ccsr: ['MBD003', 'MBD004'] },
    { id: 3, label: 'Kidney', status: 'retired' as const, ccsr: ['GEN003'] },
  ]

  it('counts entries per CCSR group and the share each unified category would cover', () => {
    const s = unifiedSuggestion([['MBD002'], ['MBD002', 'MBD003'], ['MBD004'], []], categories)
    expect(s.ccsr).toEqual([
      { ccsrCategory: 'MBD002', count: 2 },
      { ccsrCategory: 'MBD003', count: 1 },
      { ccsrCategory: 'MBD004', count: 1 },
    ])
    expect(s.withoutCcsr).toBe(1)
    expect(s.unified).toEqual([
      {
        unifiedId: 1,
        label: 'Serious mental illness',
        status: 'published',
        covered: 2,
        share: 0.5,
      },
      { unifiedId: 2, label: 'Mood disorders', status: 'draft', covered: 2, share: 0.5 },
    ])
  })

  it('keeps the top 8 groups, most entries first, then by id', () => {
    const groups = Array.from({ length: 10 }, (_, i) => [`TST00${String(i)}`])
    groups.push(['TST009'])
    const s = unifiedSuggestion(groups, [])
    expect(s.ccsr).toHaveLength(8)
    expect(s.ccsr[0]).toEqual({ ccsrCategory: 'TST009', count: 2 })
    expect(s.ccsr[1]?.ccsrCategory).toBe('TST000')
  })

  it('has nothing to suggest without ICD-10-CM entries', () => {
    expect(unifiedSuggestion([], categories)).toEqual({ ccsr: [], unified: [], withoutCcsr: 0 })
  })
})
