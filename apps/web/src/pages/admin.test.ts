import { screen } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderRoute } from '../test/render-route'

const emptyAudit = http.get('/api/admin/audit', () =>
  HttpResponse.json({ items: [], nextBefore: null }),
)

describe('/admin layout', () => {
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
