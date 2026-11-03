import type { DrillCell, StatesCompareResponse, StatesCompareRow } from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// Compare 2–4 states (roadmap M5 step 7): `/compare/states/ga-vs-mt`, only the differences by
// default, grouped by unified category; pickers that open another comparison.

const listed = (qualification: 'standalone' | 'needs_support' = 'standalone'): DrillCell => ({
  status: 'exact',
  narrowerCount: 0,
  match: {
    display: 'F31.*',
    tier: null,
    qualification,
    qualificationBasis: 'published',
    stateCategory: 'Behavioral Health',
    stateSubcategory: '',
  },
})
const notListed: DrillCell = { status: 'not_listed', match: null, narrowerCount: 0 }

function row(display: string, cells: DrillCell[], differs = true): StatesCompareRow {
  return {
    key: `icd10cm|exact|${display.replace('.', '')}`,
    codeSystem: 'icd10cm',
    codeNorm: display.replace('.', ''),
    matchKind: 'exact',
    rangeEndNorm: null,
    wildcard: false,
    display,
    codePath: null,
    description: `Text of ${display}`,
    descriptionSource: 'cms',
    differs,
    cells,
  }
}

const choices = [
  { id: 'GA', slug: 'ga', name: 'Georgia' },
  { id: 'LA', slug: 'la', name: 'Louisiana' },
  { id: 'MT', slug: 'mt', name: 'Montana' },
  { id: 'NE', slug: 'ne', name: 'Nebraska' },
]

/** The fake API, for GA and MT; `diff` is echoed back as the real one does. */
function body(url: URL): StatesCompareResponse {
  const diff = url.searchParams.get('diff') !== '0'
  const same = row('F20.0', [listed(), listed()], false)
  return {
    dataVersion: 3,
    states: [
      { id: 'GA', slug: 'ga', name: 'Georgia', hasList: true },
      { id: 'MT', slug: 'mt', name: 'Montana', hasList: true },
    ],
    choices,
    query: { diff },
    summary: {
      only: [1, 2],
      all: 4,
      rows: 7,
      differing: 5,
      similarity: { jaccard: 4 / 9, shared: 4, onlyFirst: 1, onlySecond: 4 },
    },
    totalRows: diff ? 2 : 3,
    totalGroups: 2,
    page: 1,
    pageCount: 1,
    groups: [
      {
        key: 'serious-mental-illness',
        slug: 'serious-mental-illness',
        label: 'Serious mental illness',
        counts: [3, 5],
        allRows: 5,
        differing: 4,
        rowCount: diff ? 1 : 2,
        continued: false,
        rows: [
          ...(diff ? [] : [same]),
          row('F31.*', [listed('needs_support'), { ...listed(), status: 'covered' }]),
        ],
      },
      {
        key: 'none',
        slug: null,
        label: 'Not in a unified category',
        counts: [1, 0],
        allRows: 1,
        differing: 1,
        rowCount: 1,
        continued: false,
        rows: [row('Z99.2', [listed(), notListed])],
      },
    ],
  }
}

let requested: string[] = []

beforeEach(() => {
  requested = []
  server.use(
    http.get('/api/public/states-compare', ({ request }) => {
      const url = new URL(request.url)
      requested.push(url.search)
      const states = url.searchParams.get('states')
      if (states === 'GA,ZZ') return HttpResponse.json({ error: 'Unknown state' }, { status: 404 })
      if (states === 'GA,LA') {
        return HttpResponse.json({
          ...body(url),
          states: [
            { id: 'GA', slug: 'ga', name: 'Georgia', hasList: true },
            { id: 'LA', slug: 'la', name: 'Louisiana', hasList: false },
          ],
          summary: null,
          totalRows: 0,
          totalGroups: 0,
          groups: [],
        } satisfies StatesCompareResponse)
      }
      return HttpResponse.json(body(url))
    }),
  )
})

describe('/compare/states/:pair', () => {
  it('shows the summary and only the differences, grouped, with each state’s cell', async () => {
    await renderRoute('/compare/states/ga-vs-mt')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Georgia vs Montana' }),
    ).toBeTruthy()
    expect(requested).toEqual(['?states=GA%2CMT'])
    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(summary.textContent).toContain('Only Georgia1')
    expect(summary.textContent).toContain('Only Montana2')
    expect(summary.textContent).toContain('Both4')
    expect(summary.textContent).toContain('Similarity0.44')

    const table = screen.getByRole('table', { name: 'Codes where Georgia and Montana differ' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent.trim())
    expect(headers).toEqual(['Code', 'Description', 'Georgia', 'Montana'])
    const smi = within(table).getByRole('rowheader', { name: /Serious mental illness/ })
    expect(within(smi).getByRole('link').getAttribute('href')).toBe(
      '/compare/serious-mental-illness',
    )
    const f31 = within(table).getByRole('row', { name: /F31\.\*/ })
    expect(f31.textContent).toContain('Needs another code')
    expect(f31.textContent).toContain('Covered by F31.*')
    expect(within(table).getByRole('rowheader', { name: /Not in a unified category/ })).toBeTruthy()
    expect(within(table).queryByRole('row', { name: /F20\.0/ })).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Download every code (CSV)' }).getAttribute('href'),
    ).toBe('/compare/states/ga-vs-mt/codes.csv')
  })

  it('“Show only differences” off shows every code, marking the ones that differ', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/states/ga-vs-mt')
    const toggle = await screen.findByRole('checkbox', { name: 'Show only differences' })
    expect((toggle as HTMLInputElement).checked).toBe(true)
    await user.click(toggle)
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/states/ga-vs-mt?diff=0')
    })
    const table = await screen.findByRole('table', { name: 'Every code of Georgia and Montana' })
    expect(within(table).getByRole('row', { name: /F20\.0/ }).textContent).not.toContain('Differs')
    expect(within(table).getByRole('row', { name: /F31\.\*/ }).textContent).toContain('Differs')
  })

  it('the pickers open another comparison', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/states/ga-vs-mt')
    const pickers = await screen.findByRole('group', { name: 'States to compare' })
    expect(
      within(pickers)
        .getAllByRole('combobox')
        .map((s) => (s as HTMLSelectElement).value),
    ).toEqual(['GA', 'MT', '', ''])
    await user.selectOptions(within(pickers).getByRole('combobox', { name: 'Third state' }), 'NE')
    await user.click(within(pickers).getByRole('button', { name: 'Compare' }))
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/states/ga-vs-mt-vs-ne')
    })
  })

  it('says when a state has no list, and when the address is not a comparison', async () => {
    await renderRoute('/compare/states/ga-vs-la')
    expect(
      await screen.findByText(
        /Louisiana has no list on this site yet, so there is nothing to compare/,
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('answers “Comparison not found” for an unknown state', async () => {
    await renderRoute('/compare/states/ga-vs-zz')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Comparison not found' }),
    ).toBeTruthy()
  })

  it('answers “Comparison not found” for one state, without asking the API', async () => {
    await renderRoute('/compare/states/ga-vs-ga')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Comparison not found' }),
    ).toBeTruthy()
    expect(requested).toEqual([])
  })
})
