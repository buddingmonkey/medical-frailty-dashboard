import {
  codeSystems,
  type CompareResponse,
  federalCategories,
  type PublicStateDetail,
  type PublicStatesResponse,
  qualifications,
  zeroCounts,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// Compare page (roadmap M4 step 2): pick a category and states, read the aligned table.

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing test fixture')
  return value
}

const published = (totalEntries: number) => ({
  versionNo: 1,
  sourceDate: null,
  updatedAt: null,
  totalEntries,
  bySystem: zeroCounts(codeSystems),
  byFederalCategory: zeroCounts(federalCategories),
  byQualification: zeroCounts(qualifications),
  mappingsConfirmed: false,
})

const statesList: PublicStatesResponse = {
  dataVersion: 3,
  items: [
    { id: 'AL', slug: 'al', name: 'Alabama', fips: '01', status: 'none', published: null },
    {
      id: 'GA',
      slug: 'ga',
      name: 'Georgia',
      fips: '13',
      status: 'published',
      published: published(6046),
    },
    {
      id: 'MT',
      slug: 'mt',
      name: 'Montana',
      fips: '30',
      status: 'published',
      published: published(309),
    },
  ],
}

const montana: PublicStateDetail = {
  dataVersion: 3,
  state: must(statesList.items[2]),
  notesMd: null,
  sources: [],
  versions: [],
  categories: [
    {
      stateCategory: 'SMI',
      stateSubcategory: '',
      federalCategory: 'disabling_mental_disorder',
      confirmed: true,
      entries: 20,
    },
    {
      stateCategory: 'SMI',
      stateSubcategory: '',
      federalCategory: 'sud',
      confirmed: true,
      entries: 4,
    },
    {
      stateCategory: 'Cancer',
      stateSubcategory: 'Solid',
      federalCategory: 'serious_complex_medical',
      confirmed: false,
      entries: 9,
    },
  ],
}

const cell = (
  status: CompareResponse['rows'][number]['cells'][number]['status'],
  match: Partial<
    NonNullable<CompareResponse['rows'][number]['cells'][number]['match']>
  > | null = null,
  narrowerCount = 0,
) => ({
  status,
  narrowerCount,
  match: match && {
    display: 'F20.0',
    tier: null,
    qualification: 'unknown' as const,
    qualificationBasis: 'published' as const,
    stateCategory: 'Mental health',
    stateSubcategory: '',
    federalCategory: 'sud' as const,
    ...match,
  },
})

const comparison: CompareResponse = {
  dataVersion: 3,
  states: [
    { id: 'GA', slug: 'ga', name: 'Georgia', published: true },
    { id: 'MT', slug: 'mt', name: 'Montana', published: true },
  ],
  totalRows: 230,
  page: 1,
  pageSize: 100,
  pageCount: 3,
  rows: [
    {
      codeSystem: 'icd10cm',
      codeNorm: 'F200',
      matchKind: 'exact',
      rangeEndNorm: null,
      wildcard: false,
      display: 'F20.0',
      codePath: '/codes/icd-10-cm/F20.0',
      description: 'Paranoid schizophrenia',
      descriptionSource: 'cms',
      cells: [
        cell('exact', { tier: 'Attachment A', qualification: 'standalone' }),
        cell('covered', {
          display: 'F20.*',
          qualification: 'needs_support',
          qualificationBasis: 'inferred',
          stateCategory: 'SMI',
          federalCategory: 'disabling_mental_disorder',
        }),
      ],
    },
    {
      codeSystem: 'cpt',
      codeNorm: '90791',
      matchKind: 'exact',
      rangeEndNorm: null,
      wildcard: false,
      display: '90791',
      codePath: '/codes/cpt/90791',
      description: 'Psychiatric diagnostic evaluation',
      descriptionSource: 'MT',
      cells: [cell('not_listed'), cell('exact', { display: '90791' })],
    },
    {
      codeSystem: 'icd10cm',
      codeNorm: 'F10',
      matchKind: 'prefix',
      rangeEndNorm: null,
      wildcard: true,
      display: 'F10.*',
      codePath: null,
      description: null,
      descriptionSource: null,
      cells: [cell('exact', { display: 'F10.*' }), cell('narrower', null, 3)],
    },
  ],
}

let compareUrls: URL[] = []

beforeEach(() => {
  compareUrls = []
  server.use(
    http.get('/api/public/states', () => HttpResponse.json(statesList)),
    http.get('/api/public/states/mt', () => HttpResponse.json(montana)),
    http.get('/api/public/compare', ({ request }) => {
      const url = new URL(request.url)
      compareUrls.push(url)
      return HttpResponse.json({ ...comparison, page: Number(url.searchParams.get('page') ?? 1) })
    }),
  )
})

describe('compare page', () => {
  it('asks for a category and states before showing a table', async () => {
    await renderRoute('/compare/codes')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Compare states by category' }),
    ).toBeTruthy()
    expect(screen.getByText(/pick a category and at least one state/i)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(compareUrls).toHaveLength(0)
  })

  it('offers only states that have a list', async () => {
    await renderRoute('/compare/codes')

    const states = await screen.findByRole('group', { name: 'States' })
    await within(states).findByRole('checkbox', { name: 'Georgia' })
    expect(within(states).getAllByRole('checkbox')).toHaveLength(2)
    expect(within(states).getByRole('checkbox', { name: 'Montana' })).toBeTruthy()
    expect(within(states).queryByRole('checkbox', { name: 'Alabama' })).toBeNull()
  })

  it('puts every choice in the URL, so the link can be shared', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/codes')

    await user.selectOptions(await screen.findByLabelText('Federal category'), 'sud')
    await user.click(await screen.findByRole('checkbox', { name: 'Montana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Georgia' }))
    await user.selectOptions(screen.getByLabelText('Code system'), 'icd10cm')
    await user.click(screen.getByRole('checkbox', { name: /only codes that qualify alone/i }))

    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe(
        '/compare/codes?states=MT,GA&category=sud&system=icd10cm&alone=1',
      )
    })
    await screen.findByRole('table')
    expect(compareUrls.at(-1)?.search).toBe('?states=MT%2CGA&category=sud&system=icd10cm&alone=1')
  })

  it('shows each state as a column and each code as a row, with the state’s own rule', async () => {
    await renderRoute('/compare/codes?states=GA,MT&category=sud')

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent.trim())
    expect(headers).toEqual(['Code', 'Description', 'Georgia', 'Montana'])
    expect(within(table).getByRole('link', { name: 'Montana' }).getAttribute('href')).toBe(
      '/states/mt',
    )

    const [, f200El, cptEl, f10El] = within(table).getAllByRole('row')
    const f200 = must(f200El)
    const cpt = must(cptEl)
    const f10 = must(f10El)
    expect(within(f200).getByRole('rowheader').textContent).toContain('F20.0')
    const [desc, ga, mt] = within(f200).getAllByRole('cell')
    expect(desc?.textContent).toContain('Paranoid schizophrenia')
    expect(ga?.textContent).toContain('Listed')
    expect(ga?.textContent).toContain('Attachment A')
    expect(ga?.textContent).toContain('Qualifies alone')
    expect(mt?.textContent).toContain('Covered by F20.*')
    expect(mt?.textContent).toContain('Needs another code (inferred)')
    expect(mt?.textContent).toContain('Filed under SMI')

    expect(within(cpt).getAllByRole('cell')[0]?.textContent).toContain('Montana’s text')
    expect(within(cpt).getAllByRole('cell')[1]?.textContent).toContain('Not listed')
    expect(within(f10).getAllByRole('cell')[2]?.textContent).toContain('3 narrower codes listed')
  })

  it('pages through the rows and offers every row as CSV', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/codes?states=GA,MT&category=sud')

    expect(await screen.findByText('230 codes, page 1 of 3')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /download all 230 rows \(csv\)/i }).getAttribute('href'),
    ).toBe('/compare/codes.csv?states=GA%2CMT&category=sud')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous page' }).disabled).toBe(
      true,
    )
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => {
      expect(router.currentRoute.value.query['page']).toBe('2')
    })
    expect(await screen.findByText('230 codes, page 2 of 3')).toBeTruthy()
  })

  it("compares one state's own category", async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/codes')

    await user.click(await screen.findByRole('radio', { name: /a state’s own category/i }))
    await user.selectOptions(screen.getByLabelText('State'), 'MT')
    const category = await screen.findByLabelText('Category')
    // SMI is split across two federal categories but is one state category.
    await waitFor(() => {
      expect(
        within(category)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Choose a category', 'Cancer › Solid', 'SMI'])
    })
    await user.selectOptions(category, 'Cancer › Solid')
    await user.click(screen.getByRole('checkbox', { name: 'Georgia' }))

    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe(
        '/compare/codes?states=MT,GA&ownState=MT&ownCategory=Cancer&ownSubcategory=Solid',
      )
    })
  })

  it('links back to the overview, and old /compare links land here', async () => {
    await renderRoute('/compare/codes')
    expect(
      (await screen.findByRole('link', { name: 'Overview of every state' })).getAttribute('href'),
    ).toBe('/compare')

    const { router } = await renderRoute('/compare?states=GA,MT&category=sud')
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/codes?states=GA,MT&category=sud')
    })
  })

  it('says so when the API refuses the selection', async () => {
    server.use(
      http.get('/api/public/compare', () =>
        HttpResponse.json({ error: 'Unknown state: ZZ' }, { status: 400 }),
      ),
    )
    await renderRoute('/compare/codes?states=ZZ&category=sud')

    expect((await screen.findByRole('alert')).textContent).toContain('Unknown state: ZZ')
  })
})
