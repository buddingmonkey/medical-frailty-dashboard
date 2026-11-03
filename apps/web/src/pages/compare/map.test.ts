import type { OverviewCell, OverviewState, PublicOverviewResponse } from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The tile map on the Map tab (roadmap M5 step 8; moved off the home page, project lead,
// 2026-11-03): one unified category across the country, a tile per state, the overview's numbers
// and shades, a picker in the URL, a table beneath.

function cell(unifiedId: number, entries: number, share: number, reviewed = true): OverviewCell {
  return {
    unifiedId,
    entries,
    qualifiesAlone: 0,
    qualifiesAloneShare: entries > 0 ? 0 : null,
    covered: Math.round(share * 10),
    share,
    reviewed: entries > 0 && reviewed,
  }
}

const state = (id: string, name: string, cells: OverviewCell[] = []): OverviewState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status: cells.length > 0 ? 'published' : 'none',
  hasList: cells.length > 0,
  cells,
})

// In the API's order: substance use disorder comes before disabling mental disorder.
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
  states: [
    state('AL', 'Alabama'),
    state('MT', 'Montana', [cell(2, 1, 1, false), cell(1, 1, 1 / 3)]),
    state('NE', 'Nebraska', [cell(2, 0, 0), cell(1, 0, 0)]),
  ],
}

beforeEach(() => {
  server.use(
    http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 2, items: [] })),
    http.get('/api/public/overview', () => HttpResponse.json(overview)),
  )
})

const ALCOHOL_MAP = 'Alcohol use: each state’s share of the codes any state lists'
const PSYCHOSES_MAP = 'Psychoses: share of the category’s codes that each state lists'

describe('the tile map', () => {
  it('shows the first category: a tile per state, numbers, links and full names', async () => {
    await renderRoute('/compare/map')

    const map = await screen.findByRole('group', { name: ALCOHOL_MAP })
    const tiles = within(map).getAllByRole('listitem')
    expect(tiles).toHaveLength(51)
    // Reading order is by name, whatever the grid places where.
    expect(tiles.slice(0, 3).map((t) => t.textContent)).toEqual([
      expect.stringContaining('AL'),
      expect.stringContaining('AK'),
      expect.stringContaining('AZ'),
    ])

    const mt = within(map).getByRole('link', {
      name: 'Montana, Alcohol use: 100% of the codes any state lists, not reviewed',
    })
    expect(mt.getAttribute('href')).toBe('/compare/alcohol-use?focus=MT')
    expect(mt.textContent).toBe('100%*')
    expect(mt.closest('li')?.textContent).toContain('MT')

    const ne = within(map).getByRole('link', { name: 'Nebraska, Alcohol use: 0%, none listed' })
    expect(ne.textContent).toBe('none')
    expect(ne.closest('li')?.className).toContain('hatch-none')

    // Only states with a list are links; the rest say so in words.
    expect(within(map).getAllByRole('link')).toHaveLength(2)
    expect(within(map).getByText('Alabama, Alcohol use: No list on this site yet')).toBeTruthy()
    expect(within(map).getAllByText('No list')).toHaveLength(49)

    // The legend is the overview's.
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend.textContent).toContain('75% or more')
    expect(legend.textContent).toContain('None listed')
    expect(legend.textContent).toContain('No list on this site yet')
  })

  it('the picker changes the map and the URL; the URL picks the category', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/map')
    const picker = await screen.findByRole('combobox', { name: 'Category' })
    expect((picker as HTMLSelectElement).value).toBe('alcohol-use')

    await user.selectOptions(picker, 'psychoses')

    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/map?category=psychoses')
    })
    const map = await screen.findByRole('group', { name: PSYCHOSES_MAP })
    expect(
      within(map)
        .getByRole('link', { name: 'Montana, Psychoses: 33% of the category’s codes' })
        .getAttribute('href'),
    ).toBe('/compare/psychoses?focus=MT')

    await user.selectOptions(picker, 'alcohol-use')
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/map')
    })
  })

  it('opens on the category a shared link names', async () => {
    await renderRoute('/compare/map?category=psychoses')
    expect(await screen.findByRole('group', { name: PSYCHOSES_MAP })).toBeTruthy()
  })

  it('holds the same data in a table under “Show as a table”', async () => {
    await renderRoute('/compare/map')
    await screen.findByRole('group', { name: ALCOHOL_MAP })

    const table = screen.getByRole('table', { name: ALCOHOL_MAP })
    expect(table.closest('details')?.querySelector('summary')?.textContent).toContain(
      'Show as a table',
    )
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(51)
    const text = (name: string) =>
      rows
        .find((r) => r.querySelector('th')?.textContent.trim() === name)
        ?.querySelector('td')
        ?.textContent.replace(/\s+/g, ' ')
        .trim()
    expect(text('Montana')).toBe('100% (not reviewed)')
    expect(text('Nebraska')).toBe('None listed')
    expect(text('Alabama')).toBe('No list on this site yet')
    expect(within(table).getByRole('link', { name: '100%' }).getAttribute('href')).toBe(
      '/compare/alcohol-use?focus=MT',
    )
  })
})

describe('the Map tab page', () => {
  it('shows the same map under its own heading, with the compare tabs', async () => {
    await renderRoute('/compare/map')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'One category across the country' }),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('navigation', { name: 'Compare views' }))
        .getByRole('link', { name: 'Map' })
        .getAttribute('aria-current'),
    ).toBe('page')
    const map = await screen.findByRole('group', { name: ALCOHOL_MAP })
    expect(within(map).getAllByRole('listitem')).toHaveLength(51)
    expect(document.title).toMatch(/^One category across the country \| /)
  })

  it('says so when no category is published', async () => {
    server.use(
      http.get('/api/public/overview', () =>
        HttpResponse.json({ ...overview, categories: [], states: [] }),
      ),
    )
    await renderRoute('/compare/map')
    expect(await screen.findByText('No categories are published yet.')).toBeTruthy()
  })
})
