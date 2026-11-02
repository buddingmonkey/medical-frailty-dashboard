import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../test/msw-server'
import { renderRoute } from '../../../test/render-route'

describe('/admin/drafts', () => {
  it('lists a state’s open drafts with links', async () => {
    server.use(
      http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
      http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
      http.get('/api/admin/states', () =>
        HttpResponse.json({
          items: [
            { id: 'GA', name: 'Georgia', status: 'none' },
            { id: 'MT', name: 'Montana', status: 'none' },
          ],
        }),
      ),
      http.get('/api/admin/drafts', ({ request }) =>
        HttpResponse.json({
          items:
            new URL(request.url).searchParams.get('stateId') === 'MT'
              ? [
                  {
                    id: 7,
                    stateId: 'MT',
                    versionNo: 3,
                    status: 'draft',
                    label: null,
                    createdBy: 'admin@example.org',
                    createdAt: '2026-11-02T14:00:00.000Z',
                    rowCount: 314,
                  },
                ]
              : [],
        }),
      ),
    )
    const user = userEvent.setup()
    await renderRoute('/admin/drafts')
    await screen.findByRole('option', { name: 'Montana' })
    await user.selectOptions(screen.getByLabelText('State'), 'MT')
    const link = await screen.findByRole('link', { name: /Draft v3/ })
    expect(link.getAttribute('href')).toBe('/admin/drafts/7')
    expect(within(link.closest('li') ?? link).getByText(/314 entries/)).toBeTruthy()

    await user.selectOptions(screen.getByLabelText('State'), 'GA')
    expect(await screen.findByText('No open drafts for Georgia.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBe('page')
  })
})
