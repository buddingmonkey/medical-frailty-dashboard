import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// /states: every state and DC, the target of "States" in the main navigation.

describe('all states page', () => {
  it('lists every state with a link to its page', async () => {
    server.use(
      http.get('/api/public/states', () =>
        HttpResponse.json({
          dataVersion: 1,
          items: [
            { id: 'AL', slug: 'al', name: 'Alabama', fips: '01', status: 'none', published: null },
            {
              id: 'MT',
              slug: 'mt',
              name: 'Montana',
              fips: '30',
              status: 'announced',
              published: null,
            },
          ],
        }),
      ),
    )
    await renderRoute('/states')

    expect(await screen.findByRole('heading', { level: 1, name: 'All states' })).toBeTruthy()
    expect(await screen.findByText(/0 of 51 states and DC have a list/)).toBeTruthy()
    const table = screen.getByRole('table', { name: 'State frailty code lists' })
    expect(within(table).getByRole('link', { name: 'Montana' }).getAttribute('href')).toBe(
      '/states/mt',
    )
    expect(document.title).toBe('All states | Medical Frailty Coding Dashboard')
  })
})
