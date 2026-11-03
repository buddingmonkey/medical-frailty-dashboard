import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderApp } from '../test/render-route'

// The header's main navigation (project lead, 2026-11-02): every public page, the current one
// marked, a menu button on small screens.

beforeEach(() => {
  server.use(
    http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items: [] })),
    http.get('/api/public/states/ga', () =>
      HttpResponse.json({ error: 'Not found' }, { status: 404 }),
    ),
  )
})

describe('main navigation', () => {
  it('links every public page in order', async () => {
    await renderApp('/compare')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => [l.textContent.trim(), l.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['States', '/states'],
      ['Compare', '/compare'],
      ['Search', '/search'],
      ['About', '/about'],
    ])
  })

  it('marks the current page, and its section on deeper pages', async () => {
    const { router } = await renderApp('/compare')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Compare' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull()

    await router.push('/states/ga')
    const states = within(nav).getByRole('link', { name: 'States' })
    // A state page is in the States section but is not the States page itself.
    expect(states.getAttribute('aria-current')).toBe('true')
    expect(
      within(nav).getByRole('link', { name: 'Compare' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('opens and closes the menu on small screens', async () => {
    const user = userEvent.setup()
    const { router } = await renderApp('/')
    const button = screen.getByRole('button', { name: 'Menu' })
    const list = document.getElementById(button.getAttribute('aria-controls') ?? '')

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(list?.dataset['open']).toBe('false')
    await user.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(list?.dataset['open']).toBe('true')

    await user.keyboard('{Escape}')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)

    await user.click(button)
    await user.click(screen.getByRole('link', { name: 'Compare' }))
    await router.isReady()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })
})
