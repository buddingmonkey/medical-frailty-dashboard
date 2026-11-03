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
      federalCategory: 'disabling_mental_disorder',
      sortOrder: 1,
      coverageBasis: 'universe',
      denominator: 10,
    },
    {
      id: 2,
      slug: 'equipment',
      label: 'Equipment',
      federalCategory: 'physical_idd_adl',
      sortOrder: 1,
      coverageBasis: 'union',
      denominator: 10,
    },
    {
      id: 3,
      slug: 'kidney-failure',
      label: 'Kidney failure',
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
    name: 'Share of each category’s codes that each state lists',
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
      await screen.findByRole('heading', { level: 1, name: 'Which states cover what' }),
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
      ['Overall', null],
    ])
    expect(
      within(names)
        .getAllByRole('button')
        .map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      'Serious mental illness',
      'Equipment † (share of the codes any state lists)',
      'Kidney failure',
    ])
    // The scrolling region can be reached by keyboard and has a name.
    expect(screen.getByRole('region', { name: /which states cover what, table/i }).tabIndex).toBe(0)
  })

  it('shows every number as text and links each cell to its drill-down', async () => {
    await renderRoute('/compare')
    const table = await matrix()

    const georgia = within(table).getByRole('row', { name: /^Georgia/ })
    expect(within(georgia).getByRole('link', { name: 'Georgia' }).getAttribute('href')).toBe(
      '/states/ga',
    )
    const smi = within(georgia).getByRole('link', {
      name: 'Georgia, Serious mental illness: 50% of the category’s codes, not reviewed',
    })
    expect(smi.getAttribute('href')).toBe('/compare/serious-mental-illness?focus=GA')
    expect(smi.textContent).toContain('50%')
    expect(smi.textContent).toContain('*')
    expect(
      within(georgia)
        .getByRole('link', { name: 'Georgia, Equipment: 100% of the codes any state lists' })
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
    const kidney = within(table).getByRole('button', { name: 'Kidney failure' })
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

    await user.click(within(table).getByRole('button', { name: 'Overall' }))
    expect(header?.hasAttribute('aria-sort')).toBe(false)
    expect(
      within(table)
        .getByRole('button', { name: 'Overall' })
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
      'States with similar coverage placed next to each other.',
    )

    await user.selectOptions(order, 'overall')
    expect(rowOrder(table)).toEqual(['Montana', 'Georgia', 'Nebraska', 'Alabama', 'Louisiana'])

    await user.selectOptions(order, 'name')
    expect(rowOrder(table)).toEqual(['Georgia', 'Montana', 'Nebraska', 'Alabama', 'Louisiana'])

    // A column sort shows in the select too.
    await user.click(
      within(table).getByRole('button', {
        name: /^Equipment\s†/,
      }),
    )
    await waitFor(() => {
      expect((order as HTMLSelectElement).value).toBe('column')
    })
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
    expect(notes.textContent).toContain('whichever of the state’s own categories')
    expect(notes.textContent).toContain('Not reviewed (*)')
    expect(screen.getByRole('link', { name: /compare single codes/i }).getAttribute('href')).toBe(
      '/compare/codes',
    )
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
