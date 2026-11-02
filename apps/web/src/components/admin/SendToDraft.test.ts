import { buildReview, type MappedRow, type ReviewResult } from '@mfcd/shared'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import { server } from '../../test/msw-server'
import SendToDraft from './SendToDraft.vue'

const row = (locator: string, rawCode: string): MappedRow => ({
  locator,
  rawCode,
  codeSystemHint: '',
  description: 'A condition',
  category: 'SMI',
  subcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  qualificationValue: '',
  included: true,
  notes: '',
})

const source = (id: number, title: string, sha256: string) => ({
  id,
  stateId: 'MT',
  title,
  url: null,
  publisherDate: null,
  retrievedAt: '2026-11-01T12:00:00.000Z',
  fileType: 'pdf',
  sha256,
  byteSize: 10,
  uploadedBy: 'admin@example.org',
  versions: [],
})

const HASH = 'a'.repeat(64)

interface Calls {
  created: unknown[]
  sources: { url: string; body: unknown }[]
  rows: { url: string; count: number }[]
}

function fakeApi(options: { drafts?: unknown[]; failRows?: boolean } = {}): Calls {
  const calls: Calls = { created: [], sources: [], rows: [] }
  server.use(
    http.get('/api/admin/sources', () =>
      HttpResponse.json({
        items: [
          source(11, 'MT list (September)', HASH),
          source(12, 'MT list (old)', 'b'.repeat(64)),
        ],
      }),
    ),
    http.get('/api/admin/drafts', () => HttpResponse.json({ items: options.drafts ?? [] })),
    http.post('/api/admin/drafts', async ({ request }) => {
      calls.created.push(await request.json())
      return HttpResponse.json(
        {
          item: {
            id: 7,
            stateId: 'MT',
            versionNo: 3,
            status: 'draft',
            label: null,
            createdBy: 'admin@example.org',
            createdAt: '2026-11-02T14:00:00.000Z',
            rowCount: 0,
          },
        },
        { status: 201 },
      )
    }),
    http.put('/api/admin/drafts/:id/sources/:sourceId', async ({ request }) => {
      calls.sources.push({ url: new URL(request.url).pathname, body: await request.json() })
      return HttpResponse.json({ ok: true })
    }),
    http.post('/api/admin/drafts/:id/rows', async ({ request }) => {
      const body = (await request.json()) as { entries: unknown[] }
      calls.rows.push({ url: new URL(request.url).pathname, count: body.entries.length })
      if (options.failRows && calls.rows.length === 2) {
        return HttpResponse.json({ error: 'Server busy' }, { status: 503 })
      }
      return HttpResponse.json({ ok: true, stored: 0 })
    }),
  )
  return calls
}

function setup(review: ReviewResult, sha256: string | null = HASH) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(SendToDraft, {
    props: { stateId: 'MT', part: 'Pages 1–8', review, sha256, namedStateIds: ['MT'] },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  })
  return userEvent.setup()
}

const smallReview = () =>
  buildReview(
    [row('r1', '33230 and 33240'), row('r2', 'SMI'), row('r3', 'F20.0')],
    {},
    {
      undottedIcd: false,
    },
  )

describe('SendToDraft', () => {
  it('picks the stored source with the same file hash and summarizes what will be sent', async () => {
    fakeApi()
    setup(smallReview())
    const select = await screen.findByLabelText<HTMLSelectElement>('Source document')
    expect(await screen.findByRole('option', { name: /MT list \(September\)/ })).toBeTruthy()
    expect(select.value).toBe('11')
    expect(screen.getByText(/3 entries from 2 rows/)).toBeTruthy()
    expect(screen.getByText(/1 row cannot be read/)).toBeTruthy()
  })

  it('asks to store a file that is not stored yet', async () => {
    fakeApi()
    setup(smallReview(), 'c'.repeat(64))
    expect(await screen.findByText(/This file is not stored yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Source files' }).getAttribute('href')).toBe(
      '/admin/sources',
    )
    expect(screen.getByRole('button', { name: 'Send to draft' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('sends to a new draft in chunks of 500 and links to it', async () => {
    const calls = fakeApi()
    const rows = Array.from({ length: 501 }, (_, i) =>
      row(`r${String(i)}`, `F${String((i % 90) + 10)}.0`),
    )
    const user = setup(buildReview(rows, {}, { undottedIcd: false }))
    await screen.findByRole('option', { name: /MT list \(September\)/ })
    await user.click(screen.getByRole('button', { name: 'Send to draft' }))

    const link = await screen.findByRole('link', { name: 'Open draft v3' })
    expect(link.getAttribute('href')).toBe('/admin/drafts/7')
    expect(calls.created).toEqual([{ stateId: 'MT' }])
    expect(calls.sources).toEqual([
      {
        url: '/api/admin/drafts/7/sources/11',
        body: {
          part: 'Pages 1–8',
          expectedEntries: 501,
          invalidRowCount: 0,
          namedStateIds: ['MT'],
        },
      },
    ])
    expect(calls.rows.map((r) => r.count)).toEqual([500, 1])
  })

  it('adds the source to an existing draft (Georgia A + B)', async () => {
    const calls = fakeApi({
      drafts: [
        {
          id: 5,
          stateId: 'MT',
          versionNo: 2,
          status: 'draft',
          label: null,
          createdBy: 'admin@example.org',
          createdAt: '2026-11-02T13:00:00.000Z',
          rowCount: 40,
        },
      ],
    })
    const user = setup(smallReview())
    await screen.findByRole('option', { name: 'Draft v2 (40 rows)' })
    await screen.findByRole('option', { name: /MT list \(September\)/ })
    await user.selectOptions(screen.getByLabelText('Draft'), '5')
    await user.click(screen.getByRole('button', { name: 'Send to draft' }))
    expect(await screen.findByRole('link', { name: 'Open draft v2' })).toBeTruthy()
    expect(calls.created).toEqual([])
    expect(calls.sources[0]?.url).toBe('/api/admin/drafts/5/sources/11')
  })

  it('says when a chunk fails, and sends the whole source again on retry', async () => {
    const calls = fakeApi({ failRows: true })
    const rows = Array.from({ length: 600 }, (_, i) =>
      row(`r${String(i)}`, `F${String((i % 90) + 10)}.0`),
    )
    const user = setup(buildReview(rows, {}, { undottedIcd: false }))
    await screen.findByRole('option', { name: /MT list \(September\)/ })
    await user.click(screen.getByRole('button', { name: 'Send to draft' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Server busy')

    await user.click(screen.getByRole('button', { name: 'Send to draft' }))
    await screen.findByRole('link', { name: 'Open draft v3' })
    // The retry reuses the draft it made and starts the source over.
    expect(calls.created).toHaveLength(1)
    expect(calls.sources).toHaveLength(2)
  })
})
