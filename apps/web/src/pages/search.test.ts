import {
  CODE_SEARCH_NOT_LISTED,
  type CodeSearchResponse,
  type CodeSearchResult,
  codeSystems,
  federalCategories,
  type PublicStateSummary,
  qualifications,
  SEARCH_PAGE,
  zeroCounts,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderRoute } from '../test/render-route'

// The search page (roadmap M6 step 2): results as you type, the URL, and the words.

const published = (id: string, name: string): PublicStateSummary => ({
  id,
  slug: id.toLowerCase(),
  name,
  fips: '00',
  status: 'published',
  published: {
    versionNo: 1,
    sourceDate: '2026-09-15',
    updatedAt: '2026-11-02T10:00:00.000Z',
    totalEntries: 10,
    bySystem: zeroCounts(codeSystems),
    byFederalCategory: zeroCounts(federalCategories),
    byQualification: zeroCounts(qualifications),
    mappingsConfirmed: false,
  },
})

const states: PublicStateSummary[] = [
  { id: 'AL', slug: 'al', name: 'Alabama', fips: '01', status: 'none', published: null },
  published('GA', 'Georgia'),
  published('MT', 'Montana'),
]

const result = (patch: Partial<CodeSearchResult> = {}): CodeSearchResult => ({
  system: 'icd10cm',
  codeNorm: 'F200',
  code: 'F20.0',
  url: '/codes/icd-10-cm/F20.0',
  description: 'Paranoid schizophrenia',
  descriptionSource: 'cms',
  descriptionState: null,
  listedBy: { count: 2, states: ['ga', 'mt'] },
  ...patch,
})

const response = (q: string, results: CodeSearchResult[]): CodeSearchResponse => ({
  query: { q, kind: 'words', states: [], system: null, limit: 20 },
  results,
  dataVersion: 1,
})

/** Every search request's query string, in order. */
let requests: URLSearchParams[] = []

function searchReturns(make: (q: string) => CodeSearchResult[]) {
  server.use(
    http.get('/api/public/codes/search', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const q = params.get('q') ?? ''
      return HttpResponse.json(response(q, make(q)))
    }),
  )
}

beforeEach(() => {
  requests = []
  server.use(
    http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items: states })),
  )
})

const searchBox = () =>
  screen.getByRole<HTMLInputElement>('searchbox', { name: SEARCH_PAGE.inputLabel })

describe('search page', () => {
  it('searches as you type, after a pause, and puts the search in the URL', async () => {
    searchReturns(() => [result()])
    const { router } = await renderRoute('/search')
    expect(screen.getByRole('heading', { level: 1, name: SEARCH_PAGE.heading })).toBeTruthy()
    expect(screen.getByText(SEARCH_PAGE.idle)).toBeTruthy()

    await userEvent.type(searchBox(), 'paranoid')

    const list = await screen.findByRole('list', { name: SEARCH_PAGE.resultsLabel })
    const link = within(list).getByRole('link', { name: /F20\.0/ })
    expect(link.getAttribute('href')).toBe('/codes/icd-10-cm/F20.0')
    expect(within(list).getByText('Paranoid schizophrenia')).toBeTruthy()
    // One request for the whole word: the pause, not every key, starts a search.
    expect(requests.map((p) => p.get('q'))).toEqual(['paranoid'])
    expect(router.currentRoute.value.query).toEqual({ q: 'paranoid' })
    expect(screen.getByRole('status').textContent).toContain('1 code found.')
  })

  it('waits for 2 characters', async () => {
    searchReturns(() => [result()])
    await renderRoute('/search?q=F')
    expect(searchBox().value).toBe('F')
    expect(screen.getByText(SEARCH_PAGE.idle)).toBeTruthy()
    expect(requests).toEqual([])
  })

  it('names the state whose text is shown and how many states list each code', async () => {
    searchReturns(() => [
      result(),
      result({
        system: 'cpt',
        codeNorm: '99213',
        code: '99213',
        url: '/codes/cpt/99213',
        description: 'Office visit, established patient',
        descriptionSource: 'state',
        descriptionState: { slug: 'ga', name: 'Georgia' },
        listedBy: { count: 1, states: ['ga'] },
      }),
      result({
        codeNorm: 'F201',
        code: 'F20.1',
        url: '/codes/icd-10-cm/F20.1',
        description: 'Disorganized schizophrenia',
        listedBy: { count: 0, states: [] },
      }),
    ])
    await renderRoute('/search?q=schiz')

    const list = await screen.findByRole('list', { name: SEARCH_PAGE.resultsLabel })
    const items = within(list).getAllByRole('listitem')
    const texts = items.map((li) => li.textContent.replace(/\s+/g, ' ').trim())
    expect(texts).toEqual([
      expect.stringContaining(
        'Listed by 2 of 2 states with a list on this site: Georgia, Montana.',
      ),
      expect.stringContaining('Text published by Georgia'),
      expect.stringContaining(`${CODE_SEARCH_NOT_LISTED}.`),
    ])
    expect(texts[0]).not.toContain('Text published by')
    expect(screen.getByRole('status').textContent).toContain('3 codes found.')
  })

  it('reads the filters from the URL and sends them', async () => {
    searchReturns(() => [result()])
    await renderRoute('/search?q=F20&states=ga&system=icd10cm')

    await screen.findByRole('list', { name: SEARCH_PAGE.resultsLabel })
    expect(requests).toHaveLength(1)
    expect(requests.at(0)?.get('q')).toBe('F20')
    expect(requests.at(0)?.get('states')).toBe('ga')
    expect(requests.at(0)?.get('system')).toBe('icd10cm')
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: SEARCH_PAGE.systemLabel }).value,
    ).toBe('icd10cm')
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Georgia' }).checked).toBe(true)
    // Only states with a list can filter.
    expect(screen.queryByRole('checkbox', { name: 'Alabama' })).toBeNull()
  })

  it('changing a filter searches again and updates the URL', async () => {
    searchReturns(() => [result()])
    const { router } = await renderRoute('/search?q=F20')
    await screen.findByRole('list', { name: SEARCH_PAGE.resultsLabel })

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: SEARCH_PAGE.systemLabel }),
      'hcpcs',
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Montana' }))

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({ q: 'F20', states: 'mt', system: 'hcpcs' })
    })
    await waitFor(() => {
      expect(requests.at(-1)?.get('states')).toBe('mt')
    })
    expect(requests.at(-1)?.get('system')).toBe('hcpcs')
  })

  it('a slow old response never replaces a newer one', async () => {
    let oldDone: () => void = () => undefined
    const oldFinished = new Promise<void>((resolve) => {
      oldDone = resolve
    })
    server.use(
      http.get('/api/public/codes/search', async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? ''
        requests.push(new URL(request.url).searchParams)
        if (q === 'pa') {
          await delay(400)
          oldDone()
          return HttpResponse.json(response(q, [result({ description: 'Old answer' })]))
        }
        return HttpResponse.json(response(q, [result({ description: 'New answer' })]))
      }),
    )
    await renderRoute('/search')

    await userEvent.type(searchBox(), 'pa')
    await waitFor(() => {
      expect(requests.map((p) => p.get('q'))).toEqual(['pa'])
    })
    await userEvent.type(searchBox(), 'r')

    expect(await screen.findByText('New answer')).toBeTruthy()
    await oldFinished
    await delay(20)
    expect(screen.queryByText('Old answer')).toBeNull()
    expect(screen.getByText('New answer')).toBeTruthy()
  })

  it('says what to try when nothing matches', async () => {
    searchReturns(() => [])
    await renderRoute('/search?q=xyzzy')
    expect(
      await screen.findByText(
        'No codes match “xyzzy”. Try a code number like F20.0, or a word like schizophrenia.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('No codes match')
  })

  it('says when the search fails', async () => {
    server.use(
      http.get('/api/public/codes/search', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 }),
      ),
    )
    await renderRoute('/search?q=F20')
    expect((await screen.findByRole('alert')).textContent).toContain(SEARCH_PAGE.error)
  })

  it('asks search engines not to index the page', async () => {
    searchReturns(() => [])
    await renderRoute('/search')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex',
    )
    expect(document.title).toBe(SEARCH_PAGE.title)
  })
})
