import { describe, expect, it } from 'vitest'

import {
  conditionGroupBodySchema,
  conditionMemberCovers,
  conditionMemberText,
  entryInConditionMember,
  likeCodeGroupsText,
  likeCodeMoreText,
  parseConditionMember,
} from './condition-groups'

// Condition groups and "like" codes (roadmap M6 step 4; docs/data-model.md, "Like codes").

describe('parseConditionMember', () => {
  it.each([
    ['icd10cm', 'C00-C96', { matchKind: 'range', codeNorm: 'C00', rangeEndNorm: 'C96' }],
    ['icd10cm', 'F20.*', { matchKind: 'prefix', codeNorm: 'F20', rangeEndNorm: null }],
    ['icd10cm', 'z99.2', { matchKind: 'exact', codeNorm: 'Z992', rangeEndNorm: null }],
    ['icd10cm', 'D68.0–D68.2', { matchKind: 'range', codeNorm: 'D680', rangeEndNorm: 'D682' }],
    ['cpt', '96401-96549', { matchKind: 'range', codeNorm: '96401', rangeEndNorm: '96549' }],
    ['hcpcs', 'J9000 - J9999', { matchKind: 'range', codeNorm: 'J9000', rangeEndNorm: 'J9999' }],
    ['hcpcs', 'G0257', { matchKind: 'exact', codeNorm: 'G0257', rangeEndNorm: null }],
  ] as const)('%s %s', (codeSystem, text, member) => {
    expect(parseConditionMember({ codeSystem, text })).toEqual({
      ok: true,
      members: [{ codeSystem, ...member }],
    })
  })

  it('reads a list of codes as several members', () => {
    const parsed = parseConditionMember({ codeSystem: 'icd10cm', text: 'B20, Z21' })
    expect(parsed.ok && parsed.members.map((m) => m.codeNorm)).toEqual(['B20', 'Z21'])
  })

  it.each([
    ['cpt', 'C50', 'does not fit'],
    ['hcpcs', '96401', 'does not fit'],
    ['icd10cm', 'C00-D49.9', 'different lengths'],
    ['icd10cm', 'C96-C00', 'ends before it starts'],
    ['icd10cm', 'cancer', 'Not a code'],
    ['ndc', '12345', 'Not a code'],
  ] as const)('refuses %s %s', (codeSystem, text, message) => {
    const parsed = parseConditionMember({ codeSystem, text })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain(message)
  })
})

describe('conditionMemberText', () => {
  it.each([
    [
      { codeSystem: 'icd10cm', matchKind: 'range', codeNorm: 'C00', rangeEndNorm: 'C96' },
      'C00-C96',
    ],
    [{ codeSystem: 'icd10cm', matchKind: 'prefix', codeNorm: 'F20', rangeEndNorm: null }, 'F20.*'],
    [{ codeSystem: 'icd10cm', matchKind: 'exact', codeNorm: 'Z992', rangeEndNorm: null }, 'Z99.2'],
    [
      { codeSystem: 'cpt', matchKind: 'range', codeNorm: '96401', rangeEndNorm: '96549' },
      '96401-96549',
    ],
  ] as const)('%o → %s, and reads back the same', (member, text) => {
    expect(conditionMemberText(member)).toBe(text)
    expect(parseConditionMember({ codeSystem: member.codeSystem, text })).toEqual({
      ok: true,
      members: [member],
    })
  })
})

describe('conditionMemberCovers: a member covers its codes and every code under them', () => {
  const cancer = { matchKind: 'range', codeNorm: 'C00', rangeEndNorm: 'C96' } as const
  const chemo = { matchKind: 'range', codeNorm: '96401', rangeEndNorm: '96549' } as const
  const esrd = { matchKind: 'exact', codeNorm: 'N186', rangeEndNorm: null } as const
  const smi = { matchKind: 'prefix', codeNorm: 'F20', rangeEndNorm: null } as const

  it.each([
    [cancer, 'C00', true],
    [cancer, 'C50911', true],
    [cancer, 'C4A0', true],
    [cancer, 'C969', true],
    [cancer, 'D00', false],
    [cancer, 'B99', false],
    [chemo, '96413', true],
    [chemo, '96549', true],
    [chemo, '96550', false],
    [esrd, 'N186', true],
    [esrd, 'N185', false],
    [smi, 'F20', true],
    [smi, 'F209', true],
    [smi, 'F21', false],
  ] as const)('%o covers %s: %s', (member, code, covers) => {
    expect(conditionMemberCovers(member, code)).toBe(covers)
  })
})

describe('entryInConditionMember: a state entry shares at least one code with the member', () => {
  const chemoDrugs = { matchKind: 'range', codeNorm: 'J9000', rangeEndNorm: 'J9999' } as const
  const e = (
    matchKind: 'exact' | 'prefix' | 'range',
    codeNorm: string,
    rangeEndNorm: string | null = null,
    includesChildren: 0 | 1 | null = 0,
  ) => ({ matchKind, codeNorm, rangeEndNorm, includesChildren })

  it.each([
    [e('exact', 'J9035'), true],
    [e('exact', 'J8999'), false],
    [e('range', 'J8500', 'J9010'), true],
    [e('range', 'J9999', 'J9999'), true],
    [e('range', 'J0100', 'J8999'), false],
    [e('exact', 'J9999'), true],
  ] as const)('%o: %s', (entry, inside) => {
    expect(entryInConditionMember(entry, chemoDrugs)).toBe(inside)
  })

  it('reads a wildcard entry as all of its codes', () => {
    const cancer = { matchKind: 'range', codeNorm: 'C00', rangeEndNorm: 'C96' } as const
    expect(entryInConditionMember(e('prefix', 'C5'), cancer)).toBe(true)
    expect(entryInConditionMember(e('exact', 'C', null, 1), cancer)).toBe(true)
    expect(entryInConditionMember(e('exact', 'C', null, 0), cancer)).toBe(false)
    expect(entryInConditionMember(e('range', 'B90', 'C01', 1), cancer)).toBe(true)
    expect(entryInConditionMember(e('prefix', 'D0'), cancer)).toBe(false)
  })
})

describe('conditionGroupBodySchema', () => {
  const body = {
    name: 'ESRD and dialysis',
    definition: 'Kidney failure treated with dialysis.',
    sources: 'ICD-10-CM N18.5–N18.6; CPT Dialysis subsection.',
    members: [{ codeSystem: 'icd10cm', text: 'N18.6' }],
  }

  it('defaults to a draft, trims text, and takes an optional slug', () => {
    const parsed = conditionGroupBodySchema.parse({ ...body, name: '  ESRD and dialysis ' })
    expect(parsed).toMatchObject({ name: 'ESRD and dialysis', status: 'draft' })
    expect(conditionGroupBodySchema.parse({ ...body, slug: 'esrd' }).slug).toBe('esrd')
  })

  it.each([
    { name: '' },
    { slug: 'Not A Slug' },
    { status: 'retired' },
    { members: [{ codeSystem: 'icd10cm', text: '' }] },
    { members: [{ codeSystem: 'nope', text: 'N18.6' }] },
    { members: Array.from({ length: 501 }, () => ({ codeSystem: 'icd10cm', text: 'N18.6' })) },
  ])('refuses %o', (patch) => {
    expect(conditionGroupBodySchema.safeParse({ ...body, ...patch }).success).toBe(false)
  })
})

describe('wording', () => {
  it('names the code’s groups in a sentence', () => {
    expect(likeCodeGroupsText(['Cancer'])).toBe('This code is in the condition group Cancer.')
    expect(likeCodeGroupsText(['Cancer', 'Organ transplant'])).toBe(
      'This code is in the condition groups Cancer and Organ transplant.',
    )
    expect(likeCodeGroupsText(['A', 'B', 'C'])).toBe(
      'This code is in the condition groups A, B and C.',
    )
  })

  it('counts the entries left out', () => {
    expect(likeCodeMoreText(1)).toBe('and 1 more code in this group')
    expect(likeCodeMoreText(12)).toBe('and 12 more codes in this group')
  })
})
