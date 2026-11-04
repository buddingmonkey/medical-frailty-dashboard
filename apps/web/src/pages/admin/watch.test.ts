import type { WatchItem } from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

function watchItem(id: number, patch: Partial<WatchItem> = {}): WatchItem {
  return {
    id,
    title: `Item ${String(id)}`,
    kind: 'court',
    stateId: null,
    dueDate: null,
    dateIsApproximate: false,
    whyMd: 'Why it matters.',
    links: [],
    repeatDays: null,
    status: 'open',
    resolutionMd: null,
    resolvedBy: null,
    resolvedAt: null,
    createdBy: 'admin@example.org',
    createdAt: '2026-11-01T22:00:00.000Z',
    ...patch,
  }
}

/** A tiny in-memory watch API. Returns the request bodies it received. */
function fakeWatchApi(initial: WatchItem[]) {
  let items = [...initial]
  const posts: unknown[] = []
  const puts: { id: string; body: unknown }[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', ({ request }) => {
      const open = new URL(request.url).searchParams.get('status') !== 'closed'
      return HttpResponse.json({
        items: items.filter((i) => (i.status === 'open') === open),
      })
    }),
    http.post('/api/admin/watch', async ({ request }) => {
      const body = (await request.json()) as Partial<WatchItem>
      posts.push(body)
      const created = watchItem(100 + posts.length, { ...body })
      items.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.put('/api/admin/watch/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      const id = String(params['id'])
      puts.push({ id, body })
      items = items.map((i) => {
        if (String(i.id) !== id) return i
        if (body['action'] === 'close') {
          return {
            ...i,
            status: body['status'] as WatchItem['status'],
            resolutionMd: body['resolutionMd'] as string,
            resolvedBy: 'admin@example.org',
            resolvedAt: '2026-11-02T01:00:00.000Z',
          }
        }
        const fields = { ...body }
        delete fields['action']
        return { ...i, ...fields }
      })
      return HttpResponse.json(items.find((i) => String(i.id) === id))
    }),
  )
  return { posts, puts }
}

const downgrade = watchItem(2, {
  title: 'Downgrade Cloudflare',
  kind: 'internal',
  dueDate: '2026-11-10',
})

const seed = [
  watchItem(1, {
    title: 'Mass. v. Oz appeal deadline',
    dueDate: '2026-12-28',
    dateIsApproximate: true,
    links: [{ label: 'Opinion', url: 'https://example.org/opinion.pdf' }],
  }),
  downgrade,
  watchItem(3, { title: 'Stale item', dueDate: '2026-10-30' }),
  watchItem(4, { title: 'Taylor v. Kennedy pending' }),
  watchItem(5, {
    title: 'Old closed item',
    status: 'done',
    resolutionMd: 'Checked; nothing changed.',
    resolvedBy: 'admin@example.org',
    resolvedAt: '2026-10-01T00:00:00.000Z',
  }),
]

function section(name: string) {
  return screen.getByRole('region', { name })
}

describe('/admin/watch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-01T18:00:00'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('groups open items by due date and marks approximate dates', async () => {
    fakeWatchApi(seed)

    await renderRoute('/admin/watch')

    await screen.findByRole('region', { name: 'Overdue' })
    expect(within(section('Overdue')).getByText('Stale item')).toBeTruthy()
    expect(within(section('Due within 14 days')).getByText('Downgrade Cloudflare')).toBeTruthy()
    const later = section('Later')
    expect(within(later).getByText('Mass. v. Oz appeal deadline')).toBeTruthy()
    expect(within(later).getByText(/approximate/)).toBeTruthy()
    expect(within(later).getByRole('link', { name: 'Opinion' }).getAttribute('href')).toBe(
      'https://example.org/opinion.pdf',
    )
    expect(within(section('No date yet')).getByText('Taylor v. Kennedy pending')).toBeTruthy()
    expect(screen.queryByText('Old closed item')).toBeNull()
  })

  it('shows the overdue and due-soon counts in a banner on admin pages', async () => {
    fakeWatchApi(seed)

    await renderRoute('/admin')

    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('1 overdue')
    expect(banner.textContent).toContain('1 due within 14 days')
    expect(within(banner).getByRole('link').getAttribute('href')).toBe('/admin/watch')
  })

  it('shows closed items and their resolution under History', async () => {
    fakeWatchApi(seed)
    const user = userEvent.setup()

    await renderRoute('/admin/watch')
    await user.click(await screen.findByRole('tab', { name: 'History' }))

    expect(await screen.findByText('Old closed item')).toBeTruthy()
    expect(screen.getByText('Checked; nothing changed.')).toBeTruthy()
  })

  it('adds an item', async () => {
    const api = fakeWatchApi([])
    const user = userEvent.setup()

    await renderRoute('/admin/watch')
    await user.click(await screen.findByRole('button', { name: 'Add an item' }))
    await user.type(screen.getByLabelText('Title'), 'Re-check Nebraska list')
    await user.selectOptions(screen.getByLabelText('Kind'), 'state_list')
    await user.type(screen.getByLabelText('Due date'), '2027-01-15')
    await user.type(screen.getByLabelText('Why it matters'), 'Lists change.')
    await user.type(screen.getByLabelText('Repeat every (days)'), '90')
    await user.click(screen.getByRole('button', { name: 'Add a link' }))
    await user.type(screen.getByLabelText('Link 1 label'), 'DHHS')
    await user.type(screen.getByLabelText('Link 1 URL'), 'https://dhhs.ne.gov/')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Re-check Nebraska list')).toBeTruthy()
    expect(api.posts).toEqual([
      {
        title: 'Re-check Nebraska list',
        kind: 'state_list',
        stateId: null,
        dueDate: '2027-01-15',
        dateIsApproximate: false,
        whyMd: 'Lists change.',
        links: [{ label: 'DHHS', url: 'https://dhhs.ne.gov/' }],
        repeatDays: 90,
      },
    ])
  })

  it('refuses a form with a missing title or a non-web link, before calling the API', async () => {
    const api = fakeWatchApi([])
    const user = userEvent.setup()

    await renderRoute('/admin/watch')
    await user.click(await screen.findByRole('button', { name: 'Add an item' }))
    await user.type(screen.getByLabelText('Why it matters'), 'x')
    await user.click(screen.getByRole('button', { name: 'Add a link' }))
    await user.type(screen.getByLabelText('Link 1 label'), 'bad')
    await user.type(screen.getByLabelText('Link 1 URL'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Title')
    expect(alert.textContent).toContain('Links')
    // The fields themselves say they are wrong and point at the message (M8 step 2).
    const title = screen.getByLabelText('Title')
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(title.getAttribute('aria-describedby')).toBe(alert.id)
    expect(screen.getByLabelText('Why it matters').getAttribute('aria-invalid')).toBeNull()
    expect(api.posts).toEqual([])
  })

  it('edits an item', async () => {
    const api = fakeWatchApi([downgrade])
    const user = userEvent.setup()

    await renderRoute('/admin/watch')
    await user.click(await screen.findByRole('button', { name: 'Edit Downgrade Cloudflare' }))
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Downgrade to Workers Free')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Downgrade to Workers Free')).toBeTruthy()
    expect(api.puts[0]).toMatchObject({
      id: '2',
      body: {
        action: 'edit',
        title: 'Downgrade to Workers Free',
        kind: 'internal',
        dueDate: '2026-11-10',
      },
    })
  })

  it('needs a resolution note to close an item', async () => {
    const api = fakeWatchApi([downgrade])
    const user = userEvent.setup()

    await renderRoute('/admin/watch')
    await user.click(await screen.findByRole('button', { name: 'Close Downgrade Cloudflare' }))
    await user.click(screen.getByRole('button', { name: 'Close item' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Write a resolution note')
    const note = screen.getByLabelText('Resolution note')
    expect(note.getAttribute('aria-invalid')).toBe('true')
    expect(note.getAttribute('aria-describedby')).toBe(alert.id)
    expect(api.puts).toEqual([])

    await user.click(screen.getByLabelText('Dismissed'))
    await user.type(screen.getByLabelText('Resolution note'), 'Already on Free.')
    await user.click(screen.getByRole('button', { name: 'Close item' }))

    expect(await screen.findByText('Nothing to watch right now.')).toBeTruthy()
    expect(api.puts).toEqual([
      { id: '2', body: { action: 'close', status: 'dismissed', resolutionMd: 'Already on Free.' } },
    ])
  })
})
