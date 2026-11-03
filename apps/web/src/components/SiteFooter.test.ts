import { FOOTER_TEXT, HOME_INTRO, STATUTE_URL } from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderApp } from '../test/render-route'

// The footer and the home page's context (M6 step 3b): where the data comes from, that the site
// decides no one's eligibility, and a link to the law. The Worker's HTML says the same.

beforeEach(() => {
  server.use(http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items: [] })))
})

describe('site footer', () => {
  it('says what the site is not, with no patient data, and links the law', async () => {
    await renderApp('/')
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain(FOOTER_TEXT)
    expect(within(footer).getByRole('link', { name: 'Read the law' }).getAttribute('href')).toBe(
      STATUTE_URL,
    )
  })

  it('gives the home page the law and what the site does not do', async () => {
    await renderApp('/')
    expect(await screen.findByText(HOME_INTRO)).toBeTruthy()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Read the law' }).getAttribute('href')).toBe(
      STATUTE_URL,
    )
  })
})
