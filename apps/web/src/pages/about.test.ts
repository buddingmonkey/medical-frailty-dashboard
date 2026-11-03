import { infoPages, REPORT_PROBLEM_URL } from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderApp, renderRoute } from '../test/render-route'

// About/methodology, disclaimer, privacy and accessibility (roadmap M8 step 4): the words come
// from packages/shared/src/about.ts, the same as the Worker's HTML.

beforeEach(() => {
  server.use(http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items: [] })))
})

describe('info pages', () => {
  for (const page of infoPages) {
    it(`${page.path}: heading, title and every section heading`, async () => {
      await renderRoute(page.path)

      expect(screen.getByRole('heading', { level: 1, name: page.heading })).toBeTruthy()
      for (const section of page.sections) {
        const heading = screen.getByRole('heading', { level: 2, name: section.heading })
        expect(heading.id).toBe(section.id)
      }
      expect(document.title).toBe(page.title)
    })
  }

  it('About lists its sections and links to the issue form', async () => {
    await renderRoute('/about')

    const toc = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(toc).getByRole('link', { name: 'How codes are matched' }).getAttribute('href'),
    ).toBe('#matching')
    expect(screen.getByRole('link', { name: 'report it on GitHub' }).getAttribute('href')).toBe(
      REPORT_PROBLEM_URL,
    )
    expect(screen.getByText(/As of November 3, 2026/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Massachusetts v\. Oz/ }).getAttribute('rel'),
    ).toContain('external')
  })

  it('the disclaimer says it is not legal advice', async () => {
    await renderApp('/disclaimer')
    const main = screen.getByRole('main')
    expect(within(main).getByText(/Nothing on this site is legal advice/)).toBeTruthy()
    expect(
      within(main).getByRole('link', { name: 'About and methodology' }).getAttribute('href'),
    ).toBe('/about')
  })
})
