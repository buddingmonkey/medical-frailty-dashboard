import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderRoute } from '../test/render-route'

const noWatchItems = http.get('/api/admin/watch', () => HttpResponse.json({ items: [] }))

const noReadiness = http.get('/api/admin/launch-readiness', () =>
  HttpResponse.json({ states: [], readyCount: 0, required: 2, gatePassed: false }),
)

const emptyAudit = http.get('/api/admin/audit', () =>
  HttpResponse.json({ items: [], nextBefore: null }),
)

describe('/admin layout', () => {
  beforeEach(() => {
    server.use(noWatchItems, noReadiness)
  })

  it('shows who is signed in, a sign-out link and the admin sections', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    )

    await renderRoute('/admin')

    expect(await screen.findByText('admin@example.org')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign out' }).getAttribute('href')).toBe(
      '/cdn-cgi/access/logout',
    )
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(nav.textContent).toContain('Overview')
    expect(nav.textContent).toContain('Audit log')
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeTruthy()
  })

  it('groups the nav in the order of the Overview’s steps', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    )

    await renderRoute('/admin')

    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const names = (group: string) =>
      within(within(nav).getByRole('list', { name: group }))
        .getAllByRole('link')
        .map((l) => l.textContent.trim())
    expect(names('Add a list')).toEqual(['Source files', 'Read and map', 'Drafts', 'Versions'])
    expect(names('Categories')).toEqual([
      'Mappings',
      'Federal categories',
      'Unified categories',
      'Condition groups',
    ])
    expect(names('Site')).toEqual([
      'Launch readiness',
      'Watch dates',
      'Backup and restore',
      'Audit log',
      'Guide',
    ])
  })

  it('marks the current section in the nav', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
      emptyAudit,
    )

    await renderRoute('/admin/audit')

    const current = await screen.findByRole('link', { current: 'page' })
    expect(current.textContent.trim()).toBe('Audit log')
  })

  it('says so when the sign-in cannot be confirmed', async () => {
    server.use(
      http.get('/api/admin/whoami', () =>
        HttpResponse.json({ error: 'Not an admin' }, { status: 403 }),
      ),
    )

    await renderRoute('/admin')

    expect((await screen.findByRole('alert')).textContent).toContain(
      'This account is not an admin of this site.',
    )
  })
})
