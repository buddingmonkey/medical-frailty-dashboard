import { cleanup, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The tab row on every /compare page (project lead, 2026-11-02): links to each view, the
// current one marked, a deeper page marking its parent. The API fails here on purpose: the tabs
// show whatever the data does.

beforeEach(() => {
  server.use(http.get('/api/public/*', () => HttpResponse.json({ error: 'Down' }, { status: 500 })))
})

const tabs = () => screen.getByRole('navigation', { name: 'Compare views' })

/** Each tab's label and its `aria-current`, for the tabs that have one. */
function marks() {
  return within(tabs())
    .getAllByRole('link')
    .flatMap((l) => {
      const mark = l.getAttribute('aria-current')
      return mark === null ? [] : [[l.textContent.trim(), mark]]
    })
}

describe('compare tabs', () => {
  it('links every view in order', async () => {
    await renderRoute('/compare')
    expect(
      within(tabs())
        .getAllByRole('link')
        .map((l) => [l.textContent.trim(), l.getAttribute('href')]),
    ).toEqual([
      ['Overview', '/compare'],
      ['Categories', '/compare/categories'],
      ['Map', '/compare/map'],
      ['Overlaps', '/compare/overlaps'],
      ['States side by side', '/compare/states'],
      ['Single codes', '/compare/codes'],
    ])
  })

  it.each([
    ['/compare', 'Overview', 'page'],
    ['/compare/categories', 'Categories', 'page'],
    ['/compare/map', 'Map', 'page'],
    ['/compare/overlaps', 'Overlaps', 'page'],
    ['/compare/states', 'States side by side', 'page'],
    ['/compare/codes', 'Single codes', 'page'],
    ['/compare/kidney-failure', 'Categories', 'true'],
    ['/compare/states/ga-vs-mt', 'States side by side', 'true'],
  ])('on %s marks %s (%s)', async (path, label, mark) => {
    await renderRoute(path)
    expect(marks()).toEqual([[label, mark]])
  })

  it('replaces the old back links to the overview', async () => {
    for (const path of ['/compare/codes', '/compare/kidney-failure', '/compare/states/ga-vs-mt']) {
      await renderRoute(path)
      expect(screen.queryByRole('link', { name: 'Overview of every state' })).toBeNull()
      cleanup()
    }
  })

  it('moves between views by keyboard', async () => {
    const user = userEvent.setup()
    const { router } = await renderRoute('/compare')
    within(tabs()).getByRole('link', { name: 'Overview' }).focus()
    await user.tab()
    expect(document.activeElement?.textContent.trim()).toBe('Categories')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 1, name: 'Comparison categories' })
    expect(router.currentRoute.value.path).toBe('/compare/categories')
    expect(marks()).toEqual([['Categories', 'page']])
  })
})
