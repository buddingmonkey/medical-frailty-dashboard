import {
  codeSystems,
  federalCategories,
  type PublicStateDetail,
  type PublicStateSummary,
  qualifications,
  zeroCounts,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The "States side by side" tab (project lead, 2026-11-02): start from your state and pick from
// its most similar states, or choose 2 to 4 states yourself.

function summary(id: string, name: string, hasList: boolean): PublicStateSummary {
  return {
    id,
    slug: id.toLowerCase(),
    name,
    fips: '01',
    status: hasList ? 'published' : 'none',
    published: hasList
      ? {
          versionNo: 1,
          sourceDate: null,
          updatedAt: null,
          totalEntries: 10,
          bySystem: zeroCounts(codeSystems),
          byFederalCategory: zeroCounts(federalCategories),
          byQualification: zeroCounts(qualifications),
          mappingsConfirmed: true,
        }
      : null,
  }
}

const items = [
  summary('AL', 'Alabama', false),
  summary('GA', 'Georgia', true),
  summary('MT', 'Montana', true),
  summary('NE', 'Nebraska', true),
]

const georgia: PublicStateDetail = {
  dataVersion: 1,
  state: items[1] ?? summary('GA', 'Georgia', true),
  notesMd: null,
  sources: [],
  versions: [],
  categories: [],
  similar: [
    { id: 'NE', slug: 'ne', name: 'Nebraska', jaccard: 0.6, shared: 6, onlyThis: 2, onlyOther: 2 },
    { id: 'MT', slug: 'mt', name: 'Montana', jaccard: 0.1, shared: 1, onlyThis: 7, onlyOther: 2 },
  ],
}

beforeEach(() => {
  server.use(
    http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items })),
    http.get('/api/public/states/ga', () => HttpResponse.json(georgia)),
  )
})

describe('states side by side', () => {
  it('offers only states with a list, under the compare tabs', async () => {
    await renderRoute('/compare/states')
    expect(screen.getByRole('heading', { level: 1, name: 'States side by side' })).toBeTruthy()
    expect(
      within(screen.getByRole('navigation', { name: 'Compare views' }))
        .getByRole('link', { name: 'States side by side' })
        .getAttribute('aria-current'),
    ).toBe('page')
    const own = await screen.findByRole('combobox', { name: 'Your state' })
    await waitFor(() => {
      expect(
        within(own)
          .getAllByRole('option')
          .map((o) => o.textContent.trim()),
      ).toEqual(['Choose a state', 'Georgia', 'Montana', 'Nebraska'])
    })
    expect(document.title).toMatch(/^States side by side \| /)
  })

  it('starts from your state: its most similar states, to compare with up to three', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/states')
    const own = await screen.findByRole('combobox', { name: 'Your state' })
    await waitFor(() => {
      expect(within(own).getAllByRole('option')).toHaveLength(4)
    })
    await user.selectOptions(own, 'ga')
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/states?state=ga')
    })

    const similar = await screen.findByRole('region', {
      name: 'States with the most similar lists',
    })
    expect(
      within(similar).getByRole('link', { name: 'Compare with Nebraska' }).getAttribute('href'),
    ).toBe('/compare/states/ga-vs-ne')
    await user.click(within(similar).getByRole('checkbox', { name: 'Nebraska' }))
    await user.click(within(similar).getByRole('checkbox', { name: 'Montana' }))
    await user.click(within(similar).getByRole('button', { name: 'Compare Georgia with 2 states' }))
    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/compare/states/ga-vs-ne-vs-mt')
    })
  })

  it('opens on the state a shared link names', async () => {
    await renderRoute('/compare/states?state=ga')
    expect(
      await screen.findByRole('region', { name: 'States with the most similar lists' }),
    ).toBeTruthy()
  })

  it('lets anyone choose 2 to 4 states', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare/states')
    const picker = await screen.findByRole('group', { name: 'States to compare' })
    const first = within(picker).getByRole('combobox', { name: 'First state' })
    await waitFor(() => {
      expect(within(first).getAllByRole('option')).toHaveLength(4)
    })
    const compare = within(picker).getByRole('button', { name: 'Compare' })
    expect((compare as HTMLButtonElement).disabled).toBe(true)
    await user.selectOptions(first, 'MT')
    await user.selectOptions(within(picker).getByRole('combobox', { name: 'Second state' }), 'NE')
    await user.click(compare)
    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/compare/states/mt-vs-ne')
    })
  })
})
