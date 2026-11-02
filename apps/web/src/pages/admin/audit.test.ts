import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const noWatchItems = http.get('/api/admin/watch', () => HttpResponse.json({ items: [] }))

const whoami = http.get('/api/admin/whoami', () =>
  HttpResponse.json({ email: 'admin@example.org' }),
)

function entry(id: number, action: string, details: Record<string, unknown> | null = null) {
  return {
    id,
    at: '2026-11-01T22:05:00.000Z',
    actorEmail: 'admin@example.org',
    action,
    target: 'state:MT',
    details,
  }
}

describe('/admin/audit', () => {
  beforeEach(() => {
    server.use(noWatchItems)
  })

  it('lists admin actions as a table, details as plain text', async () => {
    server.use(
      whoami,
      http.get('/api/admin/audit', () =>
        HttpResponse.json({
          items: [entry(2, 'source.upload', { file: '<b>mt.pdf</b>' }), entry(1, 'watch.close')],
          nextBefore: null,
        }),
      ),
    )

    await renderRoute('/admin/audit')

    const table = await screen.findByRole('table', { name: 'Audit log' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('source.upload')
    expect(rows[0]?.textContent).toContain('state:MT')
    expect(rows[0]?.textContent).toContain('{"file":"<b>mt.pdf</b>"}')
    expect(table.querySelector('b')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull()
  })

  it('loads older pages with the cursor', async () => {
    server.use(
      whoami,
      http.get('/api/admin/audit', ({ request }) => {
        const before = new URL(request.url).searchParams.get('before')
        return HttpResponse.json(
          before === '3'
            ? { items: [entry(2, 'older.two'), entry(1, 'older.one')], nextBefore: null }
            : { items: [entry(4, 'new.four'), entry(3, 'new.three')], nextBefore: 3 },
        )
      }),
    )
    const user = userEvent.setup()

    await renderRoute('/admin/audit')
    await user.click(await screen.findByRole('button', { name: 'Load older' }))

    expect(await screen.findByText('older.one')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Audit log' })
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull()
  })

  it('says when there is nothing yet', async () => {
    server.use(
      whoami,
      http.get('/api/admin/audit', () => HttpResponse.json({ items: [], nextBefore: null })),
    )

    await renderRoute('/admin/audit')

    expect(await screen.findByText('No admin actions yet.')).toBeTruthy()
  })

  it('shows an error when the log cannot be read', async () => {
    server.use(
      whoami,
      http.get('/api/admin/audit', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 }),
      ),
    )

    await renderRoute('/admin/audit')

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the audit log')
  })
})
