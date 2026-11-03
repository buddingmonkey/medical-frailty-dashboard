import { describe, expect, it } from 'vitest'

import {
  CODE_DETAIL_CONFIRMED,
  codeDetailDescriptionNote,
  codeDetailGroups,
  codeDetailIndexed,
  codeDetailMetaDescription,
  codeDetailPageTitle,
  type CodeDetailResponse,
  codeDetailResponseSchema,
  codeDetailStateSentence,
  codeDetailStatusHelp,
  codeDetailSummary,
  codeDetailTitle,
  type CodeDetailState,
  parseShowQualification,
  visibleRule,
} from './code-detail'
import { compareStatuses, compareStatusLabels } from './compare'

// The code detail page (roadmap M6 step 3): grouping, the qualification setting and wording.

const state = (id: string, status: CodeDetailState['status']): CodeDetailState => ({
  id,
  slug: id.toLowerCase(),
  name: `State ${id}`,
  status,
  narrowerCount: status === 'narrower' ? 2 : 0,
  entries: [],
})

describe('codeDetailGroups', () => {
  it('orders the groups confirmed first, keeps empty ones out, keeps state order', () => {
    const groups = codeDetailGroups([
      state('AL', 'no_list'),
      state('GA', 'covered'),
      state('MT', 'exact'),
      state('NE', 'not_listed'),
      state('LA', 'exact'),
    ])
    expect(groups.map((g) => [g.status, g.confirmed, g.states.map((s) => s.id)])).toEqual([
      ['exact', true, ['MT', 'LA']],
      ['covered', true, ['GA']],
      ['not_listed', false, ['NE']],
      ['no_list', false, ['AL']],
    ])
  })

  it('uses the M4 status words as headings, each with one sentence of help', () => {
    const [group] = codeDetailGroups([state('MT', 'narrower')])
    expect(group?.heading).toBe(compareStatusLabels.narrower)
    for (const status of compareStatuses) {
      expect(codeDetailStatusHelp[status]).toMatch(/^[A-Z].*\.$/)
    }
    expect(CODE_DETAIL_CONFIRMED.heading).toBe('Included')
  })
})

describe('show_qualification', () => {
  it('reads the setting, with all as the default', () => {
    expect(parseShowQualification(undefined)).toBe('all')
    expect(parseShowQualification('nonsense')).toBe('all')
    expect(parseShowQualification('published_only')).toBe('published_only')
    expect(parseShowQualification('none')).toBe('none')
  })

  it('shows every rule, only published ones, or none', () => {
    const inferred = { qualification: 'standalone', qualificationBasis: 'inferred' } as const
    const published = { qualification: 'needs_support', qualificationBasis: 'published' } as const
    expect(visibleRule(inferred, 'all')).toEqual(inferred)
    expect(visibleRule(inferred, 'published_only')).toEqual({
      qualification: null,
      qualificationBasis: null,
    })
    expect(visibleRule(published, 'published_only')).toEqual(published)
    expect(visibleRule(published, 'none')).toEqual({
      qualification: null,
      qualificationBasis: null,
    })
  })
})

describe('wording', () => {
  it('titles the page by the code', () => {
    expect(codeDetailTitle('F20.0')).toBe(
      'F20.0: which states include it | Medical Frailty Coding Dashboard',
    )
  })

  it('says where the description comes from, and that CPT text is the states’ own', () => {
    expect(codeDetailDescriptionNote('icd10cm', true)).toMatch(/CMS/)
    expect(codeDetailDescriptionNote('cpt', false)).toMatch(/the text it published/)
  })
})

describe('codeDetailResponseSchema', () => {
  it('accepts a response with a listed state and a state without a list', () => {
    const body = {
      dataVersion: 3,
      code: {
        codeSystem: 'icd10cm',
        codeNorm: 'F200',
        display: 'F20.0',
        path: '/codes/icd-10-cm/F20.0',
        description: 'Paranoid schizophrenia',
      },
      showQualification: 'all',
      states: [
        {
          ...state('MT', 'exact'),
          entries: [
            {
              rawCode: 'F20.0',
              display: 'F20.0',
              matchKind: 'exact',
              description: 'Paranoid schizophrenia',
              stateCategory: 'SMI',
              stateSubcategory: '',
              tier: 'Tier 1',
              qualification: 'standalone',
              qualificationBasis: 'published',
              source: {
                title: 'Montana list',
                url: 'https://dphhs.mt.gov/list.pdf',
                publisherDate: '2026-09-01',
                locator: 'p. 3',
              },
            },
          ],
        },
        state('AL', 'no_list'),
      ],
    }
    expect(codeDetailResponseSchema.parse(body)).toEqual(body)
  })
})

// ---------------------------------------------------------------------------------------------
// The server-rendered code page (roadmap M6 step 5): one plain sentence per state with a list.

const entry = (
  over: Partial<CodeDetailState['entries'][number]> = {},
): CodeDetailState['entries'][number] => ({
  rawCode: 'F20.0',
  display: 'F20.0',
  matchKind: 'exact',
  description: null,
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: null,
  qualification: 'standalone',
  qualificationBasis: 'inferred',
  source: { title: 'List', url: null, publisherDate: null, locator: null },
  ...over,
})

const code = (over: Partial<CodeDetailResponse['code']> = {}): CodeDetailResponse['code'] => ({
  codeSystem: 'icd10cm',
  codeNorm: 'F200',
  display: 'F20.0',
  path: '/codes/icd-10-cm/F20.0',
  description: 'Paranoid schizophrenia',
  ...over,
})

describe('codeDetailStateSentence', () => {
  it('says the state includes the code, with its rule and whether this site inferred it', () => {
    const la = { ...state('LA', 'exact'), name: 'Louisiana', entries: [entry()] }
    expect(codeDetailStateSentence(la, 'F20.0')).toBe(
      'Louisiana’s list includes F20.0. State’s rule: Enough by itself (inferred by this site).',
    )
    const stated = { ...la, entries: [entry({ qualificationBasis: 'published' })] }
    expect(codeDetailStateSentence(stated, 'F20.0')).toBe(
      'Louisiana’s list includes F20.0. State’s rule: Enough by itself.',
    )
  })

  it('names the broader entry that covers the code', () => {
    const mt = {
      ...state('MT', 'covered'),
      name: 'Montana',
      entries: [entry({ display: 'F20.0–F20.9', qualification: 'needs_support' })],
    }
    expect(codeDetailStateSentence(mt, 'F20.0')).toBe(
      'Montana’s list includes F20.0 through its entry F20.0–F20.9. State’s rule: Needs another code or documentation (inferred by this site).',
    )
  })

  it('leaves the rule out when the setting hides it', () => {
    const ga = {
      ...state('GA', 'exact'),
      name: 'Georgia',
      entries: [entry({ qualification: null, qualificationBasis: null })],
    }
    expect(codeDetailStateSentence(ga, 'F20.0')).toBe('Georgia’s list includes F20.0.')
  })

  it('says when the list does not include it, and when it lists narrower codes', () => {
    expect(
      codeDetailStateSentence({ ...state('GA', 'not_listed'), name: 'Georgia' }, 'F20.0'),
    ).toBe('Georgia’s list does not include F20.0.')
    expect(codeDetailStateSentence({ ...state('GA', 'narrower'), name: 'Georgia' }, 'F20')).toBe(
      'Georgia’s list does not include F20 itself, but lists 2 more specific codes under it.',
    )
    expect(codeDetailStateSentence(state('AL', 'no_list'), 'F20.0')).toBeNull()
  })
})

describe('codeDetailSummary', () => {
  const states = [
    state('AL', 'no_list'),
    { ...state('GA', 'not_listed'), name: 'Georgia' },
    { ...state('LA', 'exact'), name: 'Louisiana', entries: [entry()] },
    { ...state('MT', 'covered'), name: 'Montana', entries: [entry({ display: 'F20.*' })] },
  ]

  it('counts the states, then groups the sentences as the page does', () => {
    const summary = codeDetailSummary(code(), states)
    expect(summary.count).toBe('2 of 3 states with a list on this site include F20.0.')
    expect(summary.parts.map((p) => [p.heading, p.sentences.length])).toEqual([
      ['Included', 2],
      ['Not included', 1],
    ])
    expect(summary.parts[0]?.sentences[1]).toMatch(/^Montana’s list includes F20\.0 through/)
  })

  it('indexes a page only when a state includes the code', () => {
    expect(codeDetailIndexed(states)).toBe(true)
    expect(codeDetailIndexed([state('AL', 'no_list'), state('GA', 'narrower')])).toBe(false)
  })

  it('titles and describes the page from the data', () => {
    expect(codeDetailPageTitle(code(), states)).toBe(
      'F20.0 Paranoid schizophrenia: medical frailty status in 3 states | Medical Frailty Coding Dashboard',
    )
    // CPT: never a name from CMS (there is none) or the AMA.
    const cpt = code({ codeSystem: 'cpt', display: '99213', description: null })
    expect(codeDetailPageTitle(cpt, [state('GA', 'exact')])).toBe(
      'CPT 99213: medical frailty status in 1 state | Medical Frailty Coding Dashboard',
    )
    expect(codeDetailPageTitle(code(), [state('AL', 'no_list')])).toBe(
      codeDetailTitle('F20.0 Paranoid schizophrenia'),
    )
    expect(codeDetailMetaDescription(code(), states)).toBe(
      'F20.0 (Paranoid schizophrenia): 2 of 3 states with a list on this site include it in ' +
        'their medical frailty code lists (Louisiana and Montana). Each state’s entry, rule and ' +
        'source document.',
    )
  })
})
