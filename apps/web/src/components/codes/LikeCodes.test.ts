import {
  type CodeDetailResponse,
  type CodeDetailState,
  LIKE_CODES,
  type LikeCodeEntry,
} from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// Like codes on the code detail page (roadmap M6 step 4), through the real route.

const entry = (codeSystem: LikeCodeEntry['codeSystem'], display: string): LikeCodeEntry => ({
  codeSystem,
  rawCode: display,
  display,
  description: `Text for ${display}`,
  stateCategory: 'Cancer',
  stateSubcategory: 'Primary Diagnosis',
  source: {
    title: 'Texas list',
    url: 'https://example.gov/tx.pdf',
    publisherDate: '2026-09-15',
    locator: null,
  },
})

const base = (id: string, name: string, status: CodeDetailState['status']): CodeDetailState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status,
  narrowerCount: 0,
  entries: [],
  likeCodes: [],
})

function page(states: CodeDetailState[], groups = [{ slug: 'cancer', name: 'Cancer' }]) {
  const body: CodeDetailResponse = {
    dataVersion: 1,
    code: {
      codeSystem: 'cpt',
      codeNorm: '96413',
      display: '96413',
      path: '/codes/cpt/96413',
      description: null,
    },
    showQualification: 'all',
    conditionGroups: groups,
    states,
  }
  server.use(http.get('/api/public/codes/cpt/96413', () => HttpResponse.json(body)))
}

describe('LikeCodes', () => {
  it('shows like codes in their own labelled section, with the group and the state’s entries', async () => {
    page([
      {
        ...base('TX', 'Texas', 'not_listed'),
        likeCodes: [
          {
            group: { slug: 'cancer', name: 'Cancer' },
            total: 7,
            entries: [entry('icd10cm', 'C50.*'), entry('hcpcs', 'J9035')],
          },
        ],
      },
      base('GA', 'Georgia', 'not_listed'),
    ])
    await renderRoute('/codes/cpt/96413')
    const section = await screen.findByRole('region', { name: LIKE_CODES.heading })
    expect(within(section).getByText(LIKE_CODES.help)).toBeTruthy()
    expect(within(section).getByText('This code is in the condition group Cancer.')).toBeTruthy()
    const table = within(section).getByRole('table', { name: LIKE_CODES.heading })
    const rows = within(table).getAllByRole('row')
    // Header, two entries, and the "more" row.
    expect(rows).toHaveLength(4)
    expect(within(table).getByRole('link', { name: 'Texas' }).getAttribute('href')).toBe(
      '/states/tx',
    )
    const first = rows[1]
    if (!first) throw new Error('no entry row')
    expect(within(first).getByText('C50.*')).toBeTruthy()
    expect(within(first).getByText('ICD-10-CM')).toBeTruthy()
    expect(within(first).getByText('Text for C50.*')).toBeTruthy()
    expect(within(first).getByText('Cancer › Primary Diagnosis')).toBeTruthy()
    expect(within(table).getByText('and 5 more codes in this group')).toBeTruthy()
    // Georgia has no like codes, so it is not in the section.
    expect(within(section).queryByText('Georgia')).toBeNull()
  })

  it('shows no section when no state has like codes', async () => {
    page([base('TX', 'Texas', 'not_listed')])
    await renderRoute('/codes/cpt/96413')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: LIKE_CODES.heading })).toBeNull()
  })
})
