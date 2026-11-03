import { describe, expect, it } from 'vitest'

import {
  CODE_DETAIL_CONFIRMED,
  codeDetailDescriptionNote,
  codeDetailGroups,
  codeDetailResponseSchema,
  codeDetailStatusHelp,
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
    expect(CODE_DETAIL_CONFIRMED.heading).toBe('Confirmed')
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
      'F20.0: which states list it | Medical Frailty Coding Dashboard',
    )
  })

  it('says where the description comes from, and that CPT text is the states’ own', () => {
    expect(codeDetailDescriptionNote('icd10cm', true)).toMatch(/CMS/)
    expect(codeDetailDescriptionNote('cpt', false)).toMatch(/each state published/)
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
