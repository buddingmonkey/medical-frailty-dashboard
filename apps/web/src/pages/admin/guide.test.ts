import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

describe('/admin/guide', () => {
  it('shows the add-a-state guide from docs/add-state-source.md, as text', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
      http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    )
    await renderRoute('/admin/guide')
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: "Adding or updating a state's code list",
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 3, name: '1. Store the file (Admin → Source files)' }),
    ).toBeTruthy()
    const prompt = screen.getByText(/I want to add <state>.s list/)
    expect(prompt.tagName).toBe('CODE')
    expect(
      within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', {
        name: 'Guide',
      }),
    ).toBeTruthy()
  })
})
