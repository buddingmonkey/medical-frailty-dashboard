import {
  CODE_DETAIL_CONFIRMED,
  CODE_DETAIL_NOT_FOUND,
  type CodeDetailResponse,
  type CodeDetailState,
  codeDetailPageTitle,
  codeDetailStatusHelp,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../test/msw-server'
import { renderRoute } from '../../../test/render-route'

// The code detail page (roadmap M6 step 3).

const listed = (
  id: string,
  name: string,
  status: 'exact' | 'covered',
  display: string,
  patch: Partial<CodeDetailState['entries'][number]> = {},
): CodeDetailState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status,
  narrowerCount: 0,
  entries: [
    {
      rawCode: display,
      display,
      matchKind: status === 'exact' ? 'exact' : 'prefix',
      description: `${name}’s text`,
      stateCategory: 'Behavioral Health',
      stateSubcategory: '',
      tier: 'Tier 1',
      qualification: 'standalone',
      qualificationBasis: 'inferred',
      source: {
        title: `${name} list`,
        url: `https://example.gov/${id}.pdf`,
        publisherDate: '2026-09-15',
        locator: 'p. 3',
      },
      ...patch,
    },
  ],
})

const other = (id: string, name: string, status: CodeDetailState['status'], n = 0) => ({
  id,
  slug: id.toLowerCase(),
  name,
  status,
  narrowerCount: n,
  entries: [],
})

const f200: CodeDetailResponse = {
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
    other('AL', 'Alabama', 'no_list'),
    listed('GA', 'Georgia', 'exact', 'F20.0'),
    listed('MT', 'Montana', 'covered', 'F20.*'),
    other('NE', 'Nebraska', 'narrower', 2),
    other('TX', 'Texas', 'not_listed'),
  ],
}

function serve(path: string, body: CodeDetailResponse | null, status = 200) {
  server.use(
    http.get(`/api/public/codes/${path}`, () =>
      body
        ? HttpResponse.json(body)
        : HttpResponse.json({ error: status === 404 ? 'Not found' : 'Boom' }, { status }),
    ),
  )
}

describe('/codes/:system/:code', () => {
  it('shows the code, its description and the confirmed states first', async () => {
    serve('icd-10-cm/F20.0', f200)
    await renderRoute('/codes/icd-10-cm/F20.0')

    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('F20.0')
    expect(h1.textContent).toContain('Paranoid schizophrenia')
    await waitFor(() => {
      expect(document.title).toBe(codeDetailPageTitle(f200.code, f200.states))
    })

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Listed (1)',
      'Covered by a broader entry (1)',
      'Narrower codes listed (1)',
      'Not listed (1)',
      'No list on this site (1)',
    ])
    expect(
      screen.getByRole('heading', { level: 2, name: CODE_DETAIL_CONFIRMED.heading }),
    ).toBeTruthy()
    expect(screen.getByText(codeDetailStatusHelp.covered)).toBeTruthy()
  })

  it('gives each listed state its entry, text, rule, tier and source, linked to its page', async () => {
    serve('icd-10-cm/F20.0', f200)
    await renderRoute('/codes/icd-10-cm/F20.0')

    const table = await screen.findByRole('table', { name: 'Listed' })
    const row = within(table).getByRole('row', { name: /Georgia/ })
    expect(within(row).getByRole('link', { name: 'Georgia' }).getAttribute('href')).toBe(
      '/states/ga',
    )
    expect(row.textContent).toContain('Georgia’s text')
    expect(row.textContent).toContain('Tier 1')
    expect(row.textContent).toContain('Enough by itself (inferred)')
    expect(row.textContent).toContain('Behavioral Health')
    const source = within(row).getByRole('link', { name: /Georgia list/ })
    expect(source.getAttribute('href')).toBe('https://example.gov/GA.pdf')
    expect(row.textContent).toContain('p. 3')
    const badge = within(row).getByRole('button', { name: 'Enough by itself (inferred)' })
    expect(badge.hasAttribute('tabindex')).toBe(false)

    const covered = screen.getByRole('table', { name: 'Covered by a broader entry' })
    expect(covered.textContent).toContain('F20.*')

    const narrower = screen.getByRole('list', { name: 'Narrower codes listed' })
    expect(narrower.textContent).toContain('Nebraska')
    expect(narrower.textContent).toContain('2 narrower codes listed')
    expect(
      within(screen.getByRole('list', { name: 'No list on this site' }))
        .getByRole('link', { name: 'Alabama' })
        .getAttribute('href'),
    ).toBe('/states/al')
  })

  it('answers in one plain sentence per state with a list, as the server HTML does', async () => {
    serve('icd-10-cm/F20.0', f200)
    await renderRoute('/codes/icd-10-cm/F20.0')

    const summary = await screen.findByRole('region', { name: 'Summary' })
    expect(summary.textContent).toContain('2 of 4 states with a list on this site include F20.0.')
    const included = within(summary).getByRole('list', { name: 'Included' })
    expect(
      within(included)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Georgia’s list includes F20.0. State’s rule: Enough by itself (inferred by this site).',
      'Montana’s list includes F20.0 through its entry F20.*. State’s rule: Enough by itself (inferred by this site).',
    ])
    const others = within(summary).getByRole('list', { name: 'Not included' })
    expect(others.textContent).toContain(
      'Nebraska’s list does not include F20.0 itself, but lists 2 more specific codes under it.',
    )
    expect(others.textContent).toContain('Texas’s list does not include F20.0.')
    expect(summary.textContent).not.toContain('Alabama')
  })

  it('replaces another spelling of the code with its canonical address', async () => {
    serve('icd-10-cm/f200', f200)
    serve('icd-10-cm/F20.0', f200)
    const { router } = await renderRoute('/codes/ICD-10-CM/f200')
    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/codes/icd-10-cm/F20.0')
    })
  })

  it('leaves the rule out when the site setting hides it', async () => {
    serve('icd-10-cm/F20.0', {
      ...f200,
      showQualification: 'none',
      states: [
        listed('GA', 'Georgia', 'exact', 'F20.0', {
          qualification: null,
          qualificationBasis: null,
        }),
      ],
    })
    await renderRoute('/codes/icd-10-cm/F20.0')
    const table = await screen.findByRole('table', { name: 'Listed' })
    expect(within(table).queryByRole('columnheader', { name: 'Rule' })).toBeNull()
    expect(table.textContent).not.toContain('Enough by itself')
  })

  it('says CPT text is the state’s own when there is no official description', async () => {
    serve('cpt/99213', {
      ...f200,
      code: {
        codeSystem: 'cpt',
        codeNorm: '99213',
        display: '99213',
        path: '/codes/cpt/99213',
        description: null,
      },
    })
    await renderRoute('/codes/cpt/99213')
    expect(await screen.findByText(/the text it published/)).toBeTruthy()
  })

  it('says it is loading until the code arrives', async () => {
    serve('icd-10-cm/F20.0', f200)
    await renderRoute('/codes/icd-10-cm/F20.0')
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('shows a not-found page on 404', async () => {
    serve('icd-10-cm/Z99.9', null, 404)
    await renderRoute('/codes/icd-10-cm/Z99.9')
    expect(
      await screen.findByRole('heading', { level: 1, name: CODE_DETAIL_NOT_FOUND.heading }),
    ).toBeTruthy()
    await waitFor(() => {
      expect(document.title).toBe(CODE_DETAIL_NOT_FOUND.title)
    })
  })

  it('shows an error when the API fails', async () => {
    serve('icd-10-cm/F20.0', null, 500)
    await renderRoute('/codes/icd-10-cm/F20.0')
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/)
  })
})
