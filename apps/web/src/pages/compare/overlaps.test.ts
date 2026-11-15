import type { OverlapIntersection, OverlapsResponse, PublicOverviewResponse } from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The Overlaps tab (project lead, 2026-11-12): an UpSet view of one category. A row per
// exclusive intersection, said in words in its header; dots and bars hidden from assistive
// tech, numbers as text; the picker in the URL; the top 20 rows until "Show all".

const overview: PublicOverviewResponse = {
  dataVersion: 2,
  categories: [
    {
      id: 2,
      slug: 'alcohol-use',
      label: 'Alcohol use',
      definition: '',
      federalCategory: 'sud',
      sortOrder: 1,
      coverageBasis: 'union',
      denominator: 1,
    },
    {
      id: 1,
      slug: 'psychoses',
      label: 'Psychoses',
      definition: '',
      federalCategory: 'disabling_mental_disorder',
      sortOrder: 1,
      coverageBasis: 'universe',
      denominator: 3,
    },
  ],
  states: [],
}

const code = (norm: string) => ({
  key: `icd10cm|exact|${norm}`,
  display: norm,
  codeSystem: 'icd10cm' as const,
  codePath: `/codes/icd-10-cm/${norm}`,
})

const alcohol: OverlapsResponse = {
  dataVersion: 2,
  category: { id: 2, slug: 'alcohol-use', label: 'Alcohol use', federalCategory: 'sud' },
  states: [
    { id: 'MT', slug: 'mt', name: 'Montana', codeCount: 5 },
    { id: 'GA', slug: 'ga', name: 'Georgia', codeCount: 3 },
    { id: 'NE', slug: 'ne', name: 'Nebraska', codeCount: 1 },
  ],
  totalCodes: 6,
  intersections: [
    { stateIds: ['GA', 'MT'], size: 2, codes: [code('F10.10'), code('F10.20')] },
    {
      stateIds: ['MT'],
      size: 2,
      codes: [
        code('F10.30'),
        { key: 'icd10cm|prefix|F11', display: 'F11.*', codeSystem: 'icd10cm', codePath: null },
      ],
    },
    { stateIds: ['GA', 'MT', 'NE'], size: 1, codes: [code('F10.0')] },
    { stateIds: ['GA'], size: 1, codes: [code('F10.9')] },
  ],
}

const psychoses: OverlapsResponse = {
  ...alcohol,
  category: { id: 1, slug: 'psychoses', label: 'Psychoses', federalCategory: 'sud' },
  states: [{ id: 'GA', slug: 'ga', name: 'Georgia', codeCount: 1 }],
  totalCodes: 1,
  intersections: [{ stateIds: ['GA'], size: 1, codes: [code('F20.0')] }],
}

beforeEach(() => {
  server.use(
    http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 2, items: [] })),
    http.get('/api/public/overview', () => HttpResponse.json(overview)),
    http.get('/api/public/overlaps', ({ request }) => {
      const slug = new URL(request.url).searchParams.get('category')
      if (slug === 'alcohol-use') return HttpResponse.json(alcohol)
      if (slug === 'psychoses') return HttpResponse.json(psychoses)
      return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    }),
  )
})

const ALCOHOL = 'Alcohol use: groups of states that list exactly the same codes'

async function table(name = ALCOHOL) {
  return screen.findByRole('table', { name })
}

describe('the Overlaps tab', () => {
  it('has its heading, its tab marked, and a picker on the first category', async () => {
    await renderRoute('/compare/overlaps')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Which states list the same codes' }),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('navigation', { name: 'Compare views' }))
        .getByRole('link', { name: 'Overlaps' })
        .getAttribute('aria-current'),
    ).toBe('page')
    const picker = await screen.findByRole('combobox', { name: 'Category' })
    expect((picker as HTMLSelectElement).value).toBe('alcohol-use')
    expect(document.title).toMatch(/^Which states list the same codes \| /)
  })

  it('says each row in words in its header, with its size as visible text', async () => {
    await renderRoute('/compare/overlaps')
    const t = await table()
    const named = [
      '2 codes listed by exactly these 2 states: Georgia and Montana',
      '2 codes listed only by Montana',
      '1 code listed by all 3 states that list codes in this category',
      '1 code listed only by Georgia',
    ].map((name) => within(t).getByRole('rowheader', { name }))
    expect(named).toEqual(within(t).getAllByRole('rowheader'))
    const first = within(t).getAllByRole('row')[1]
    if (!first) throw new Error('no row')
    const cells = within(first).getAllByRole('cell')
    expect(cells[0]?.textContent.trim()).toBe('2')
    // One cell per state, in column order (MT, GA, NE): words for screen readers, a dot hidden.
    expect(cells.slice(1).map((c) => c.textContent.trim())).toEqual([
      'In this group',
      'In this group',
      'Not in this group',
    ])
    for (const dot of t.querySelectorAll('[data-dot]')) {
      expect(dot.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('heads each state column with its name and set size, the largest first', async () => {
    await renderRoute('/compare/overlaps')
    const t = await table()
    const headers = within(t).getAllByRole('columnheader')
    const named = [
      'Group of states',
      'Codes',
      'Montana, 5 codes',
      'Georgia, 3 codes',
      'Nebraska, 1 code',
    ].map((name) => within(t).getByRole('columnheader', { name }))
    expect(named).toEqual(headers)
    // The number and the postal code show; the name is for screen readers.
    expect(named[2]?.textContent.replace(/\s+/g, ' ')).toContain('5')
    expect(named[2]?.textContent).toContain('MT')
  })

  it('opens a row to list its codes as links', async () => {
    const user = userEvent.setup()
    await renderRoute('/compare/overlaps')
    const t = await table()
    const trigger = within(t).getByRole('button', { name: '2 codes listed only by Montana' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(within(t).queryByRole('link', { name: 'F10.30' })).toBeNull()

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(within(t).getByRole('link', { name: 'F10.30' }).getAttribute('href')).toBe(
      '/codes/icd-10-cm/F10.30',
    )
    // A wildcard has no page.
    expect(within(t).getByText('F11.*').closest('a')).toBeNull()
  })

  it('scrolls the wide table inside a focusable, labelled region', async () => {
    await renderRoute('/compare/overlaps')
    const t = await table()
    const region = screen.getByRole('region', { name: `${ALCOHOL}, table` })
    expect(region.contains(t)).toBe(true)
    expect(region.getAttribute('tabindex')).toBe('0')
  })

  it('the picker changes the table and the URL; the URL picks the category', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/overlaps')
    const picker = await screen.findByRole('combobox', { name: 'Category' })
    await table()

    await user.selectOptions(picker, 'psychoses')

    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/overlaps?category=psychoses')
    })
    const t = await table('Psychoses: groups of states that list exactly the same codes')
    expect(within(t).getAllByRole('rowheader')).toHaveLength(1)
  })

  it('opens on the category a shared link names', async () => {
    await renderRoute('/compare/overlaps?category=psychoses')
    expect(await table('Psychoses: groups of states that list exactly the same codes')).toBeTruthy()
  })

  it('shows the top 20 rows until “Show all”', async () => {
    const many: OverlapIntersection[] = Array.from({ length: 25 }, (_, i) => ({
      stateIds: ['GA'],
      size: 30 - i,
      codes: [code(`F${String(10 + i)}`)],
    }))
    server.use(
      http.get('/api/public/overlaps', () =>
        HttpResponse.json({ ...alcohol, intersections: many }),
      ),
    )
    const user = userEvent.setup()
    await renderRoute('/compare/overlaps')
    const t = await table()
    expect(within(t).getAllByRole('rowheader')).toHaveLength(20)
    expect(screen.getByText(/in 25 groups; the largest 20 are shown\.$/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Show all 25 groups' }))

    expect(within(t).getAllByRole('rowheader')).toHaveLength(25)
    await user.click(screen.getByRole('button', { name: 'Show the top 20' }))
    expect(within(t).getAllByRole('rowheader')).toHaveLength(20)
  })

  it('says so when no state lists anything in the category', async () => {
    server.use(
      http.get('/api/public/overlaps', () =>
        HttpResponse.json({ ...alcohol, states: [], totalCodes: 0, intersections: [] }),
      ),
    )
    await renderRoute('/compare/overlaps')
    expect(await screen.findByText('No state includes any code in this category yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says so when no category is published', async () => {
    server.use(
      http.get('/api/public/overview', () =>
        HttpResponse.json({ ...overview, categories: [], states: [] }),
      ),
    )
    await renderRoute('/compare/overlaps')
    expect(await screen.findByText('No categories are published yet.')).toBeTruthy()
  })
})
