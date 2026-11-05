import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

describe('/admin overview', () => {
  it('lists the steps to add a state, with links that use the nav’s names', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
      http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    )
    await renderRoute('/admin')

    const heading = await screen.findByRole('heading', { level: 2, name: 'Overview' })
    const section = heading.closest('section')
    if (!section) throw new Error('no section')
    expect(section.textContent).not.toMatch(/coming next|not built/i)

    const nav = screen.getByRole('navigation', { name: 'Admin' })
    for (const name of [
      'Source files',
      'Read and map',
      'Drafts',
      'Versions',
      'Mappings',
      'Federal categories',
      'Audit log',
    ]) {
      const link = within(section).getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(
        within(nav).getByRole('link', { name }).getAttribute('href'),
      )
    }
  })
})
