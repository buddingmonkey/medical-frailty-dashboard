import {
  codeSystems,
  federalCategories,
  type PublicStateSummary,
  qualifications,
  zeroCounts,
} from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderRoute } from '../test/render-route'

// Home page (roadmap M3 step 2): the state map, its summary card and the table view.

const georgia: PublicStateSummary = {
  id: 'GA',
  slug: 'ga',
  name: 'Georgia',
  fips: '13',
  status: 'published',
  published: {
    versionNo: 2,
    sourceDate: '2026-09-15',
    updatedAt: '2026-11-02T10:00:00.000Z',
    totalEntries: 6047,
    bySystem: { ...zeroCounts(codeSystems), icd10cm: 6000, hcpcs: 47 },
    byFederalCategory: { ...zeroCounts(federalCategories), sud: 47, unmapped: 6000 },
    byQualification: { ...zeroCounts(qualifications), standalone: 6047 },
    mappingsConfirmed: false,
  },
}

const montana: PublicStateSummary = {
  id: 'MT',
  slug: 'mt',
  name: 'Montana',
  fips: '30',
  status: 'announced',
  published: null,
}

const alabama: PublicStateSummary = {
  id: 'AL',
  slug: 'al',
  name: 'Alabama',
  fips: '01',
  status: 'none',
  published: null,
}

function serve(items: PublicStateSummary[]) {
  server.use(http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 3, items })))
}

describe('home page', () => {
  it('draws a link for each state, named with its status', async () => {
    serve([alabama, georgia, montana])

    await renderRoute('/')

    const map = await screen.findByRole('group', { name: 'Map of state frailty code lists' })
    const ga = within(map).getByRole('link', { name: 'Georgia: list on this site, 6,047 entries' })
    expect(ga.getAttribute('href')).toBe('/states/ga')
    expect(
      within(map).getByRole('link', { name: 'Montana: list announced, not on this site yet' }),
    ).toBeTruthy()
    expect(within(map).getByRole('link', { name: 'Alabama: no list yet' })).toBeTruthy()
    // States the API did not send are still drawn (the 50 states and DC).
    expect(within(map).getAllByRole('link')).toHaveLength(51)
    expect(screen.getByText('1 of 51 states and DC have a list on this site.')).toBeTruthy()
  })

  it('shows a state’s counts when it gets keyboard focus', async () => {
    serve([alabama, georgia, montana])
    const user = userEvent.setup()
    await renderRoute('/')
    const map = await screen.findByRole('group', { name: 'Map of state frailty code lists' })
    const ga = within(map).getByRole('link', { name: /^Georgia/ })

    while (document.activeElement !== ga) await user.tab()

    const card = screen.getByRole('region', { name: 'Georgia' })
    expect(card.textContent).toContain('6,047 entries')
    expect(card.textContent).toContain('ICD-10-CM6,000')
    expect(card.textContent).toContain('HCPCS Level II47')
    expect(card.textContent).toContain('Substance use disorder47')
    expect(card.textContent).toContain('Unclassified6,000')
    expect(card.textContent).toContain('September 15, 2026')
    expect(card.textContent).toContain('not yet confirmed')
    expect(
      within(card).getByRole('link', { name: 'See Georgia’s list' }).getAttribute('href'),
    ).toBe('/states/ga')
  })

  it('shows the same data as a table', async () => {
    serve([alabama, georgia, montana])
    const user = userEvent.setup()
    await renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Table' }))

    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('group', { name: 'Map of state frailty code lists' })).toBeNull()
    const table = screen.getByRole('table', { name: 'State frailty code lists' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('th')?.textContent.trim())).toEqual([
      'Alabama',
      'Georgia',
      'Montana',
    ])
    const gaRow = rows[1]
    if (!gaRow) throw new Error('no Georgia row')
    expect(gaRow.textContent).toContain('List on this site')
    expect(gaRow.textContent).toContain('6,047')
    expect(gaRow.textContent).toContain('September 15, 2026')
    expect(within(gaRow).getByRole('link', { name: 'Georgia' }).getAttribute('href')).toBe(
      '/states/ga',
    )
  })

  it('says so when the states cannot be loaded', async () => {
    server.use(
      http.get('/api/public/states', () => HttpResponse.json({ error: 'x' }, { status: 500 })),
    )

    await renderRoute('/')

    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded')
  })
})
