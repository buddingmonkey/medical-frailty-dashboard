import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const noWatchItems = http.get('/api/admin/watch', () => HttpResponse.json({ items: [] }))
const whoami = http.get('/api/admin/whoami', () =>
  HttpResponse.json({ email: 'admin@example.org' }),
)

function state(
  stateId: string,
  name: string,
  counts: { unmapped: number; unconfirmed: number; notReviewed: number },
) {
  const ready = counts.unmapped === 0 && counts.unconfirmed === 0 && counts.notReviewed === 0
  return {
    stateId,
    name,
    versionId: 7,
    versionNo: 2,
    publishedAt: '2026-11-02T10:00:00.000Z',
    categories: 4,
    unified: { unmapped: counts.unmapped, unconfirmed: counts.unconfirmed },
    federal: { unmapped: 1, auto: 3 },
    notReviewed: counts.notReviewed,
    ready,
  }
}

function respond(states: ReturnType<typeof state>[]) {
  const readyCount = states.filter((s) => s.ready).length
  server.use(
    http.get('/api/admin/launch-readiness', () =>
      HttpResponse.json({ states, readyCount, required: 2, gatePassed: readyCount >= 2 }),
    ),
  )
}

describe('/admin/launch-readiness', () => {
  beforeEach(() => {
    server.use(noWatchItems, whoami)
  })

  it('says the gate has not passed and links each count to where it is fixed', async () => {
    respond([
      state('GA', 'Georgia', { unmapped: 2, unconfirmed: 1, notReviewed: 3 }),
      state('MT', 'Montana', { unmapped: 0, unconfirmed: 0, notReviewed: 0 }),
    ])
    await renderRoute('/admin/launch-readiness')

    const banner = await screen.findByRole('status', { name: 'Launch data gate' })
    expect(banner.textContent).toContain('1 of 2 states ready')
    expect(banner.textContent).toContain('not passed')

    const table = screen.getByRole('table', { name: 'Launch readiness by state' })
    const [ga, mt] = within(table).getAllByRole('row').slice(1)
    if (!ga || !mt) throw new Error('rows')
    expect(within(ga).getByRole('link', { name: '2 unmapped' }).getAttribute('href')).toBe(
      '/admin/mappings',
    )
    expect(within(ga).getByRole('link', { name: '1 not approved' }).getAttribute('href')).toBe(
      '/admin/mappings',
    )
    expect(within(ga).getByRole('link', { name: '1 unmapped' }).getAttribute('href')).toBe(
      '/admin/categories',
    )
    expect(within(ga).getByRole('link', { name: '3 guessed' }).getAttribute('href')).toBe(
      '/admin/categories',
    )
    expect(ga.textContent).toContain('Not ready')
    expect(ga.textContent).toContain('3 shown as not yet reviewed')
    expect(mt.textContent).toContain('Ready')
    expect(mt.textContent).not.toContain('Not ready')

    expect(screen.getByText(/real users/i).textContent).toContain('not tracked here')
  })

  it('says the gate passes with 2 ready states', async () => {
    respond([
      state('LA', 'Louisiana', { unmapped: 0, unconfirmed: 0, notReviewed: 0 }),
      state('MT', 'Montana', { unmapped: 0, unconfirmed: 0, notReviewed: 0 }),
    ])
    await renderRoute('/admin/launch-readiness')

    const banner = await screen.findByRole('status', { name: 'Launch data gate' })
    expect(banner.textContent).toContain('2 of 2 states ready')
    expect(banner.textContent).toContain('passes')
  })

  it('says so when no state has a published list', async () => {
    respond([])
    await renderRoute('/admin/launch-readiness')
    expect(await screen.findByText('No state has a published list yet.')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Launch data gate' }).textContent).toContain(
      '0 of 2 states ready',
    )
  })

  it('is in the admin nav', async () => {
    respond([])
    await renderRoute('/admin/launch-readiness')
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByRole('link', { name: 'Launch readiness' })).toBeTruthy()
  })
})
