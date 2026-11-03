import type { OverviewCell, OverviewState, PublicOverviewResponse } from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The overview matrix at /compare (roadmap M5 step 5): every state against every published
// unified category, a number and a shade per cell, sortable, each cell opening the drill-down.

function cell(unifiedId: number, share: number, reviewed = true): OverviewCell {
  const entries = share === 0 ? 0 : 4
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

function listed(id: string, name: string, shares: [number, number, number], reviewed = true) {
  return {
    id,
    slug: id.toLowerCase(),
    name,
    status: 'published' as const,
    hasList: true,
    cells: shares.map((s, i) => cell(i + 1, s, i === 0 ? reviewed : true)),
  } satisfies OverviewState
}

const noList = (id: string, name: string, status: 'none' | 'announced' = 'none') =>
  ({
    id,
    slug: id.toLowerCase(),
    name,
    status,
    hasList: false,
    cells: [],
  }) satisfies OverviewState

// Overall: GA 0.5, MT 0.567, NE 0.333. Nearest to MT is GA (0.54 against 1.55).
const overview: PublicOverviewResponse = {
  dataVersion: 4,
  categories: [
    {
      id: 1,
      slug: 'serious-mental-illness',
      label: 'Serious mental illness',
      definition: '',
      federalCategory: 'disabling_mental_disorder',
      sortOrder: 1,
      coverageBasis: 'universe',
      denominator: 10,
    },
    {
      id: 2,
      slug: 'equipment',
      label: 'Equipment',
      definition: '',
      federalCategory: 'physical_idd_adl',
      sortOrder: 1,
      coverageBasis: 'union',
      denominator: 10,
    },
    {
      id: 3,
      slug: 'kidney-failure',
      label: 'Kidney failure',
      definition: '',
      federalCategory: 'serious_complex_medical',
      sortOrder: 1,
      coverageBasis: 'universe',
      denominator: 10,
    },
  ],
  states: [
    noList('AL', 'Alabama'),
    listed('GA', 'Georgia', [0.5, 1, 0], false),
    noList('LA', 'Louisiana', 'announced'),
    listed('MT', 'Montana', [1, 0.5, 0.2]),
    listed('NE', 'Nebraska', [0.1, 0, 0.9]),
  ],
}

beforeEach(() => {
  server.use(http.get('/api/public/overview', () => HttpResponse.json(overview)))
})

async function matrix() {
  return screen.findByRole('table', {
    name: 'Share of each category’s diagnosis codes that each state’s list includes',
  })
}

const rowOrder = (table: HTMLElement) =>
  within(table)
    .getAllByRole('rowheader')
    .map((h) => h.textContent.trim())

describe('overview matrix', () => {
  it('groups the categories under their federal category, with an overall column', async () => {
    await renderRoute('/compare')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'How much of each category each state lists',
      }),
    ).toBeTruthy()
    const table = await matrix()
    const [federal, names] = within(table).getAllByRole('row')
    if (!federal || !names) throw new Error('missing header rows')
    expect(
      within(federal)
        .getAllByRole('columnheader')
        .map((h) => [h.textContent.trim(), h.getAttribute('colspan')]),
    ).toEqual([
      ['State', null],
      ['Disabling mental disorder', '1'],
      ['Physical, intellectual or developmental disability', '1'],
      ['Serious or complex medical condition', '1'],
      ['Overall (average)', null],
    ])
    // Each header links to its category page and has its own sort button.
    expect(
      within(names)
        .getAllByRole('link')
        .map((l) => [l.textContent.replace(/\s+/g, ' ').trim(), l.getAttribute('href')]),
    ).toEqual([
      ['Serious mental illness', '/compare/serious-mental-illness'],
      ['Equipment † (share of the entries any state lists)', '/compare/equipment'],
      ['Kidney failure', '/compare/kidney-failure'],
    ])
    for (const label of ['Serious mental illness', 'Equipment', 'Kidney failure']) {
      expect(within(names).getByRole('button', { name: `Sort by ${label}` })).toBeTruthy()
    }
    // The scrolling region can be reached by keyboard and has a name.
    expect(
      screen.getByRole('region', { name: /how much of each category each state lists, table/i })
        .tabIndex,
    ).toBe(0)
  })

  it('shows every number as text and links each cell to its drill-down', async () => {
    await renderRoute('/compare')
    const table = await matrix()

    const georgia = within(table).getByRole('row', { name: /^Georgia/ })
    expect(within(georgia).getByRole('link', { name: 'Georgia' }).getAttribute('href')).toBe(
      '/states/ga',
    )
    const smi = within(georgia).getByRole('link', {
      name: 'Georgia, Serious mental illness: 50% of the category’s diagnosis codes, not yet reviewed',
    })
    expect(smi.getAttribute('href')).toBe('/compare/serious-mental-illness?focus=GA')
    expect(smi.textContent).toContain('50%')
    expect(smi.textContent).toContain('*')
    expect(
      within(georgia)
        .getByRole('link', { name: 'Georgia, Equipment: 100% of the entries any state lists' })
        .textContent.trim(),
    ).toBe('100%')
    const none = within(georgia).getByRole('link', {
      name: 'Georgia, Kidney failure: 0%, none listed',
    })
    expect(none.getAttribute('href')).toBe('/compare/kidney-failure?focus=GA')
    // Overall: the average of 50%, 100% and 0%.
    expect(within(georgia).getAllByRole('cell').at(-1)?.textContent.trim()).toBe('50%')
  })

  it('gives a state without a list one cell across the row, after the states with one', async () => {
    await renderRoute('/compare')
    const table = await matrix()

    expect(rowOrder(table)).toEqual(['Georgia', 'Montana', 'Nebraska', 'Alabama', 'Louisiana'])
    const alabama = within(table).getByRole('row', { name: /^Alabama/ })
    const [only, ...rest] = within(alabama).getAllByRole('cell')
    expect(rest).toHaveLength(0)
    expect(only?.textContent.trim()).toBe('No list on this site yet')
    expect(only?.getAttribute('colspan')).toBe('4')
  })

  it('sorts by a column, highest first, then flips; says so in a live region', async () => {
    const user = userEvent.setup()
    await renderRoute('/compare')
    const table = await matrix()
    const status = screen.getByRole('status')
    const kidney = within(table).getByRole('button', { name: 'Sort by Kidney failure' })
    const header = kidney.closest('th')

    expect(header?.hasAttribute('aria-sort')).toBe(false)
    kidney.focus()
    await user.keyboard('{Enter}')
    expect(header?.getAttribute('aria-sort')).toBe('descending')
    expect(rowOrder(table)).toEqual(['Nebraska', 'Montana', 'Georgia', 'Alabama', 'Louisiana'])
    expect(status.textContent).toBe('Sorted by Kidney failure, highest first.')
    expect(document.activeElement).toBe(kidney)

    await user.keyboard('{Enter}')
    expect(header?.getAttribute('aria-sort')).toBe('ascending')
    expect(rowOrder(table)).toEqual(['Georgia', 'Montana', 'Nebraska', 'Alabama', 'Louisiana'])
    expect(status.textContent).toBe('Sorted by Kidney failure, lowest first.')

    await user.click(within(table).getByRole('button', { name: 'Overall (average)' }))
    expect(header?.hasAttribute('aria-sort')).toBe(false)
    expect(
      within(table)
        .getByRole('button', { name: 'Overall (average)' })
        .closest('th')
        ?.getAttribute('aria-sort'),
    ).toBe('descending')
    expect(rowOrder(table)).toEqual(['Montana', 'Georgia', 'Nebraska', 'Alabama', 'Louisiana'])
  })

  it('orders states by name, overall coverage or similarity', async () => {
    const user = userEvent.setup()
    await renderRoute('/compare')
    const table = await matrix()
    const order = screen.getByLabelText('Order states by')

    await user.selectOptions(order, 'similar')
    expect(rowOrder(table)).toEqual(['Montana', 'Georgia', 'Nebraska', 'Alabama', 'Louisiana'])
    expect(screen.getByRole('status').textContent).toBe(
      'States with similar numbers placed next to each other.',
    )

    await user.selectOptions(order, 'overall')
    expect(rowOrder(table)).toEqual(['Montana', 'Georgia', 'Nebraska', 'Alabama', 'Louisiana'])

    await user.selectOptions(order, 'name')
    expect(rowOrder(table)).toEqual(['Georgia', 'Montana', 'Nebraska', 'Alabama', 'Louisiana'])

    // A column sort shows in the select too.
    await user.click(
      within(table).getByRole('button', {
        name: 'Sort by Equipment',
      }),
    )
    await waitFor(() => {
      expect((order as HTMLSelectElement).value).toBe('column')
    })
  })

  it('keeps the order in the URL, defaults left out, so a shared link keeps it', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare')
    const table = await matrix()
    const query = () => router.currentRoute.value.query

    await user.click(within(table).getByRole('button', { name: 'Sort by Kidney failure' }))
    await waitFor(() => {
      expect(query()).toEqual({ sort: 'kidney-failure' })
    })
    await user.click(within(table).getByRole('button', { name: 'Sort by Kidney failure' }))
    await waitFor(() => {
      expect(query()).toEqual({ sort: 'kidney-failure', dir: 'asc' })
    })
    await user.selectOptions(screen.getByLabelText('Order states by'), 'similar')
    await waitFor(() => {
      expect(query()).toEqual({ order: 'similar' })
    })
    await user.selectOptions(screen.getByLabelText('Order states by'), 'name')
    await waitFor(() => {
      expect(query()).toEqual({})
    })
    expect(router.currentRoute.value.path).toBe('/compare')
  })

  it('opens a shared link in its order, without announcing it', async () => {
    await renderRoute('/compare?sort=kidney-failure&dir=asc')
    const table = await matrix()
    expect(rowOrder(table)).toEqual(['Georgia', 'Montana', 'Nebraska', 'Alabama', 'Louisiana'])
    expect(
      within(table)
        .getByRole('button', { name: 'Sort by Kidney failure' })
        .closest('th')
        ?.getAttribute('aria-sort'),
    ).toBe('ascending')
    expect(screen.getByLabelText<HTMLSelectElement>('Order states by').value).toBe('column')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('explains the shades, the marks and the numbers', async () => {
    await renderRoute('/compare')
    await matrix()

    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent.trim()),
    ).toEqual(['75% or more', '25–74%', '1–24%', 'None listed', 'No list on this site yet'])
    const notes = screen.getByRole('region', { name: 'Reading this table' })
    expect(notes.textContent).toContain('no matter which of the state’s own categories')
    expect(notes.textContent).toContain('* Not yet reviewed:')
    // The Single codes tab replaces the old link to the code table.
    expect(screen.queryByRole('link', { name: /compare single codes/i })).toBeNull()
  })

  it('says so when no category is published yet', async () => {
    server.use(
      http.get('/api/public/overview', () =>
        HttpResponse.json({
          ...overview,
          categories: [],
          states: overview.states.map((s) => ({ ...s, cells: [] })),
        }),
      ),
    )
    await renderRoute('/compare')
    expect(await screen.findByText('No categories are published yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
