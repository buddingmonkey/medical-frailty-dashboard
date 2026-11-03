import type {
  DrillCell,
  DrillDetailResponse,
  DrillGroup,
  DrillMatch,
  DrillResponse,
  DrillRow,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The category drill-down (roadmap M5 step 6): codes grouped by ICD-10-CM category, ranked by
// how many states list them; filters, focus state and details, all in the URL.

const listedMatch: DrillMatch = {
  display: 'F20.0',
  tier: 'Attachment A',
  qualification: 'standalone',
  qualificationBasis: 'published',
  stateCategory: 'Behavioral Health',
  stateSubcategory: '',
}
const listed: DrillCell = { status: 'exact', narrowerCount: 0, match: listedMatch }

function row(key: string, display: string, count: number, focus: DrillCell | null): DrillRow {
  const [codeSystem, kind, codeNorm = ''] = key.split('|')
  return {
    key,
    codeSystem: codeSystem === 'hcpcs' ? 'hcpcs' : 'icd10cm',
    codeNorm,
    matchKind: kind === 'prefix' ? 'prefix' : 'exact',
    rangeEndNorm: null,
    wildcard: kind === 'prefix',
    display,
    codePath: null,
    description: `Text of ${display}`,
    descriptionSource: 'cms',
    count,
    rules: count > 0 ? [{ qualification: 'standalone', count, inferred: count > 1 ? 1 : 0 }] : [],
    focus,
  }
}

/** The fake API: two groups; the query is echoed back as the real one does. */
function drillBody(url: URL, universeSize = 6): DrillResponse {
  const show = (url.searchParams.get('show') ?? 'all') as DrillResponse['query']['show']
  const focus = url.searchParams.get('focus')
  const all = url.searchParams.get('all') === '1' && universeSize > 0
  const cell = (c: DrillCell) => (focus ? c : null)
  const groups: DrillGroup[] = [
    {
      key: 'icd10cm|F20',
      codeSystem: 'icd10cm',
      label: 'F20',
      description: 'Schizophrenia',
      anyCount: 3,
      rowCount: 2,
      rows: [
        row('icd10cm|exact|F200', 'F20.0', 3, cell(listed)),
        row(
          'icd10cm|exact|F209',
          'F20.9',
          1,
          cell({ status: 'not_listed', match: null, narrowerCount: 0 }),
        ),
      ],
    },
    {
      key: 'icd10cm|F31',
      codeSystem: 'icd10cm',
      label: 'F31',
      description: 'Bipolar disorder',
      anyCount: 1,
      rowCount: all ? 2 : 1,
      rows: [
        row(
          'icd10cm|prefix|F31',
          'F31.*',
          1,
          cell({ status: 'narrower', match: null, narrowerCount: 2 }),
        ),
        ...(all
          ? [
              row(
                'icd10cm|exact|F3110',
                'F31.10',
                0,
                cell({ status: 'not_listed', match: null, narrowerCount: 0 }),
              ),
            ]
          : []),
      ],
    },
  ]
  return {
    dataVersion: 3,
    category: {
      id: 1,
      slug: 'serious-mental-illness',
      label: 'Serious mental illness',
      definition: 'Psychotic and severe mood disorders.',
      includes: 'Schizophrenia, bipolar disorder.',
      excludes: null,
      federalCategory: 'disabling_mental_disorder',
      version: 2,
      universeSize,
      ccsr: universeSize > 0 ? [{ id: 'MBD001', description: 'Schizophrenia spectrum' }] : [],
    },
    states: [
      { id: 'GA', slug: 'ga', name: 'Georgia' },
      { id: 'LA', slug: 'la', name: 'Louisiana' },
      { id: 'MT', slug: 'mt', name: 'Montana' },
    ],
    systems: ['icd10cm', 'hcpcs'],
    query: { show, system: null, all, focus },
    totalRows: all ? 4 : 3,
    totalGroups: 2,
    page: 1,
    pageCount: 1,
    groups,
  }
}

const detail: DrillDetailResponse = {
  dataVersion: 3,
  row: {
    key: 'icd10cm|exact|F200',
    codeSystem: 'icd10cm',
    codeNorm: 'F200',
    matchKind: 'exact',
    rangeEndNorm: null,
    wildcard: false,
    display: 'F20.0',
    codePath: null,
    description: 'Paranoid schizophrenia',
    descriptionSource: 'cms',
    count: 2,
    rules: [{ qualification: 'standalone', count: 2, inferred: 0 }],
  },
  statesWithList: 3,
  states: [
    {
      id: 'AL',
      slug: 'al',
      name: 'Alabama',
      hasList: false,
      cell: { status: 'no_list', match: null, narrowerCount: 0 },
    },
    { id: 'GA', slug: 'ga', name: 'Georgia', hasList: true, cell: listed },
    {
      id: 'LA',
      slug: 'la',
      name: 'Louisiana',
      hasList: true,
      cell: { status: 'not_listed', match: null, narrowerCount: 0 },
    },
    {
      id: 'MT',
      slug: 'mt',
      name: 'Montana',
      hasList: true,
      cell: {
        status: 'covered',
        narrowerCount: 0,
        match: {
          ...listedMatch,
          display: 'F20.0–F20.9',
          tier: null,
          stateCategory: 'SMI',
          qualificationBasis: 'inferred',
        },
      },
    },
  ],
}

let universe = 6
let requested: string[] = []

beforeEach(() => {
  universe = 6
  requested = []
  server.use(
    http.get('/api/public/categories/:slug', ({ request, params }) => {
      if (params['slug'] !== 'serious-mental-illness') {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const url = new URL(request.url)
      requested.push(url.search)
      return HttpResponse.json(drillBody(url, universe))
    }),
    http.get('/api/public/categories/:slug/detail', () => HttpResponse.json(detail)),
  )
})

const table = () =>
  screen.findByRole('table', { name: /Serious mental illness: codes by how many states list them/ })
const codeRows = (t: HTMLElement) =>
  within(t)
    .queryAllByRole('rowheader')
    .filter((h) => h.getAttribute('scope') === 'row')
    .map((h) => h.textContent.trim())

describe('category drill-down', () => {
  it('describes the category: federal parent, definition, CCSR groups with AHRQ’s citation', async () => {
    await renderRoute('/compare/serious-mental-illness')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Serious mental illness' }),
    ).toBeTruthy()
    expect(screen.getByText('Federal category: Disabling mental disorder')).toBeTruthy()
    expect(screen.getByText('Psychotic and severe mood disorders.')).toBeTruthy()
    expect(screen.getByText(/Schizophrenia, bipolar disorder\./)).toBeTruthy()
    expect(screen.getByText(/MBD001/)).toBeTruthy()
    expect(screen.getByText(/Agency for Healthcare Research and Quality/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Compare single codes/ }).getAttribute('href')).toBe(
      '/compare/codes?states=GA%2CLA%2CMT&category=disabling_mental_disorder',
    )
    expect(screen.getByRole('link', { name: /Download every row/ }).getAttribute('href')).toBe(
      '/compare/serious-mental-illness/codes.csv',
    )
    expect(document.title).toBe(
      'Serious mental illness codes by state | Medical Frailty Coding Dashboard',
    )
  })

  it('shows groups collapsed with "All codes"; a group button expands it', async () => {
    const user = userEvent.setup()
    await renderRoute('/compare/serious-mental-illness')
    const t = await table()
    const f20 = within(t).getByRole('button', { name: 'F20' })
    expect(f20.getAttribute('aria-expanded')).toBe('false')
    expect(within(t).getByText('3 of 3 list any')).toBeTruthy()
    expect(codeRows(t)).toEqual([])

    await user.click(f20)
    expect(f20.getAttribute('aria-expanded')).toBe('true')
    expect(codeRows(t)).toEqual(['F20.0', 'F20.9'])
    const f200 = within(t).getByRole('row', { name: /^F20\.0/ })
    expect(within(f200).getByText('3 of 3 states')).toBeTruthy()
    expect(within(f200).getByText('Qualifies alone 3 (1 inferred)')).toBeTruthy()
    await user.click(f20)
    expect(codeRows(t)).toEqual([])
  })

  it('filters with segmented buttons; the filter is in the URL and opens every group', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/serious-mental-illness')
    await table()
    const filters = screen.getByRole('group', { name: 'Show' })
    expect(
      within(filters).getByRole('button', { name: 'All codes' }).getAttribute('aria-pressed'),
    ).toBe('true')

    await user.click(within(filters).getByRole('button', { name: 'Only one state' }))
    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({ show: 'one' })
    })
    expect(
      within(filters).getByRole('button', { name: 'Only one state' }).getAttribute('aria-pressed'),
    ).toBe('true')
    await waitFor(() => {
      expect(requested.at(-1)).toBe('?show=one')
    })
    const t = await table()
    await waitFor(() => {
      expect(codeRows(t)).toEqual(['F20.0', 'F20.9', 'F31.*'])
    })
    expect(within(t).getByRole('button', { name: 'F31' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('"Include codes no state lists" adds them, with all=1 in the URL', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/serious-mental-illness')
    await table()
    const box = screen.getByRole('checkbox', { name: 'Include codes no state lists' })
    expect((box as HTMLInputElement).disabled).toBe(false)
    await user.click(box)
    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({ all: '1' })
    })
    const t = await table()
    await user.click(within(t).getByRole('button', { name: 'F31' }))
    await waitFor(() => {
      expect(within(t).getByRole('row', { name: /^F31\.10/ })).toBeTruthy()
    })
    expect(
      within(within(t).getByRole('row', { name: /^F31\.10/ })).getByText('0 of 3 states'),
    ).toBeTruthy()
  })

  it('disables the checkbox, and says why, for a category without a full code list', async () => {
    universe = 0
    await renderRoute('/compare/serious-mental-illness')
    await table()
    const box = screen.getByRole('checkbox', { name: 'Include codes no state lists' })
    expect((box as HTMLInputElement).disabled).toBe(true)
    expect(box.getAttribute('aria-describedby')).toBeTruthy()
    expect(
      screen.getByText(
        'No full code list for this category, so only codes some state lists are shown.',
      ),
    ).toBeTruthy()
  })

  it('adds the focus state’s column, in the M4 words', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/serious-mental-illness?show=everyone')
    await table()
    await user.selectOptions(screen.getByLabelText('Focus state'), 'GA')
    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({ show: 'everyone', focus: 'GA' })
    })
    const t = await table()
    expect(await within(t).findByRole('columnheader', { name: 'Georgia' })).toBeTruthy()
    const f200 = within(t).getByRole('row', { name: /^F20\.0/ })
    expect(within(f200).getByText('Listed')).toBeTruthy()
    expect(within(f200).getByText('Attachment A')).toBeTruthy()
    expect(within(f200).getAllByText('Qualifies alone').length).toBeGreaterThan(0)
    const f31 = within(t).getByRole('row', { name: /^F31\.\*/ })
    expect(within(f31).getByText('2 narrower codes listed')).toBeTruthy()
  })

  it('opens details for a code: each state’s rule, the others as abbreviations', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/serious-mental-illness?show=everyone')
    const t = await table()
    await user.click(within(t).getByRole('button', { name: 'Details for F20.0' }))
    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        show: 'everyone',
        code: 'icd10cm|exact|F200',
      })
    })
    const panel = await screen.findByRole('region', { name: /F20\.0 Paranoid schizophrenia/ })
    expect(within(panel).getByText('Listed by 2 of 3 states with lists.')).toBeTruthy()
    const georgia = within(panel).getByText('Georgia').closest('li')
    expect(georgia?.textContent).toContain('Listed')
    expect(georgia?.textContent).toContain('Attachment A')
    expect(georgia?.textContent).toContain('Filed under Behavioral Health')
    const montana = within(panel).getByText('Montana').closest('li')
    expect(montana?.textContent).toContain('Covered by F20.0–F20.9')
    expect(montana?.textContent).toContain('Qualifies alone (inferred)')
    expect(within(panel).getByText('Not listed (1)')).toBeTruthy()
    expect(within(panel).getByText('LA')).toBeTruthy()
    expect(within(panel).getByText('No list on this site (1)')).toBeTruthy()
    expect(within(panel).getByText('AL')).toBeTruthy()

    await user.click(within(panel).getByRole('button', { name: 'Close details' }))
    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({ show: 'everyone' })
    })
  })

  it('opens a shared link with its filter, focus and details', async () => {
    await renderRoute(
      '/compare/serious-mental-illness?show=gaps&all=1&focus=MT&code=icd10cm%7Cexact%7CF200',
    )
    await table()
    expect(
      within(screen.getByRole('group', { name: 'Show' }))
        .getByRole('button', { name: 'Gaps (under half)' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Include codes no state lists' })
        .checked,
    ).toBe(true)
    expect(screen.getByLabelText<HTMLSelectElement>('Focus state').value).toBe('MT')
    expect(
      await screen.findByRole('region', { name: /F20\.0 Paranoid schizophrenia/ }),
    ).toBeTruthy()
    expect(requested.at(-1)).toBe('?show=gaps&all=1&focus=MT')
  })

  it('says so when the category does not exist or is not published', async () => {
    await renderRoute('/compare/no-such-category')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Category not found' }),
    ).toBeTruthy()
    expect(document.title).toBe('Category not found | Medical Frailty Coding Dashboard')
  })
})
