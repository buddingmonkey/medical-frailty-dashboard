import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const version = (id: number, versionNo: number, status: string) => ({
  id,
  versionNo,
  status,
  rowCount: 300 + versionNo,
  createdBy: 'admin@example.org',
  createdAt: '2026-11-01T15:00:00.000Z',
  publishedBy: status === 'draft' ? null : 'admin@example.org',
  publishedAt: status === 'draft' ? null : '2026-11-01T16:00:00.000Z',
})

function fakeApi() {
  const rollbacks: unknown[] = []
  let items = [version(9, 3, 'draft'), version(8, 2, 'published'), version(5, 1, 'superseded')]
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({ items: [{ id: 'MT', name: 'Montana', status: 'published' }] }),
    ),
    http.get('/api/admin/states/MT/versions', () => HttpResponse.json({ items })),
    http.post('/api/admin/states/MT/rollback', async ({ request }) => {
      rollbacks.push(await request.json())
      items = [version(9, 3, 'draft'), version(8, 2, 'superseded'), version(5, 1, 'published')]
      return HttpResponse.json({ ok: true })
    }),
  )
  return rollbacks
}

describe('/admin/versions', () => {
  it('lists a state’s versions and restores an earlier one after a second click', async () => {
    const rollbacks = fakeApi()
    const user = userEvent.setup()
    await renderRoute('/admin/versions')
    await screen.findByRole('option', { name: 'Montana' })
    await user.selectOptions(screen.getByLabelText('State'), 'MT')

    const table = await screen.findByRole('table', { name: 'Versions of Montana' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent.trim())).toEqual([
      'Draft',
      'Public now',
      'Earlier',
    ])
    const [draftRow] = rows
    if (!draftRow) throw new Error('no rows')
    expect(within(draftRow).getByRole('link', { name: 'Open draft v3' })).toBeTruthy()

    await user.click(within(table).getByRole('button', { name: 'Restore v1' }))
    expect(rollbacks).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Yes, make v1 public again' }))
    expect(await screen.findByText(/v1 is public again/)).toBeTruthy()
    expect(rollbacks).toEqual([{ versionId: 5 }])
    expect(screen.getByRole('link', { name: 'Versions' }).getAttribute('aria-current')).toBe('page')
  })
})
