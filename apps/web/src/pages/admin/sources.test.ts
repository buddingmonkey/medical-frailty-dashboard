import { sha256Hex, sourceDetailsSchema, type SourceDocument } from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const pdfBytes = new TextEncoder().encode('%PDF-1.7\n%%EOF\n')
const pdfFile = () =>
  new File([pdfBytes], 'DPHHSMedicallyFrailCodeList_092926.pdf', { type: 'application/pdf' })

function source(id: number, patch: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    stateId: 'MT',
    title: `Source ${String(id)}`,
    url: null,
    publisherDate: null,
    retrievedAt: '2026-10-30T15:00:00.000Z',
    fileType: 'pdf',
    sha256: 'a'.repeat(64),
    byteSize: 81_234,
    uploadedBy: 'admin@example.org',
    versions: [],
    ...patch,
  }
}

interface Upload {
  query: Record<string, string>
  contentType: string | null
  body: Uint8Array
}

/** In-memory sources API for MT. Returns what was uploaded. */
function fakeSourcesApi(stored: SourceDocument[]) {
  const items = [...stored]
  const uploads: Upload[] = []
  const edits: { id: string; body: unknown }[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({
        items: [
          { id: 'MT', name: 'Montana', status: 'none' },
          { id: 'NE', name: 'Nebraska', status: 'none' },
        ],
      }),
    ),
    http.get('/api/admin/sources', ({ request }) => {
      const params = new URL(request.url).searchParams
      const sha = params.get('sha256')
      return HttpResponse.json({
        items: items.filter(
          (s) => s.stateId === params.get('stateId') && (sha === null || s.sha256 === sha),
        ),
      })
    }),
    http.post('/api/admin/sources', async ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams)
      const body = new Uint8Array(await request.arrayBuffer())
      uploads.push({ query, contentType: request.headers.get('content-type'), body })
      const created = source(50, {
        stateId: query['stateId'] ?? '',
        title: query['title'] ?? '',
        sha256: query['sha256'] ?? '',
        byteSize: body.byteLength,
        retrievedAt: '2026-11-01T23:00:00.000Z',
      })
      items.unshift(created)
      return HttpResponse.json({ source: created, duplicate: false }, { status: 201 })
    }),
    http.put('/api/admin/sources/:sourceId', async ({ params, request }) => {
      const body = sourceDetailsSchema.parse(await request.json())
      edits.push({ id: String(params['sourceId']), body })
      const index = items.findIndex((s) => String(s.id) === params['sourceId'])
      const current = items[index]
      if (!current) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
      const next = { ...current, ...body }
      items[index] = next
      return HttpResponse.json(next)
    }),
  )
  return { uploads, edits }
}

async function chooseState(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByRole('option', { name })
  await user.selectOptions(screen.getByLabelText('State'), name)
}

describe('/admin/sources', () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
  })

  it('lists the chosen state’s stored files with a download link', async () => {
    fakeSourcesApi([
      source(7, {
        title: 'DPHHS list',
        url: 'https://dphhs.mt.gov/list.pdf',
        publisherDate: '2026-09-29',
        versions: [{ id: 3, versionNo: 1, status: 'published' }],
      }),
    ])

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')

    const table = await screen.findByRole('table', { name: 'Stored files for Montana' })
    const row = within(table).getAllByRole('row')[1]
    if (!row) throw new Error('no data row')
    expect(row.textContent).toContain('DPHHS list')
    expect(row.textContent).toContain('79 KB')
    expect(row.textContent).toContain('v1 (published)')
    expect(within(row).getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(
      '/api/admin/sources/7/file',
    )
    expect(within(row).getByRole('link', { name: 'State’s copy' }).getAttribute('href')).toBe(
      'https://dphhs.mt.gov/list.pdf',
    )
  })

  it('uploads the raw file with its hash and metadata', async () => {
    const api = fakeSourcesApi([])

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')
    await user.upload(screen.getByLabelText('File'), pdfFile())
    const title = await screen.findByLabelText('Title')
    expect((title as HTMLInputElement).value).toBe('DPHHSMedicallyFrailCodeList_092926')
    await user.clear(title)
    await user.type(title, 'DPHHS Medically Frail Condition List')
    await user.type(
      screen.getByLabelText('State’s URL for this file (optional)'),
      'https://dphhs.mt.gov/list.pdf',
    )
    await user.type(screen.getByLabelText('Date on the document (optional)'), '2026-09-29')
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    expect((await screen.findByRole('status')).textContent).toContain('Stored')
    expect(api.uploads).toHaveLength(1)
    expect(api.uploads[0]?.contentType).toBe('application/octet-stream')
    expect(Array.from(api.uploads[0]?.body ?? [])).toEqual(Array.from(pdfBytes))
    expect(api.uploads[0]?.query).toEqual({
      stateId: 'MT',
      title: 'DPHHS Medically Frail Condition List',
      fileType: 'pdf',
      sha256: await sha256Hex(new Uint8Array(pdfBytes)),
      url: 'https://dphhs.mt.gov/list.pdf',
      publisherDate: '2026-09-29',
    })
    expect(await screen.findByText('DPHHS Medically Frail Condition List')).toBeTruthy()
  })

  it('warns before upload when the same file is already stored for the state', async () => {
    const api = fakeSourcesApi([
      source(7, {
        title: 'DPHHS list',
        sha256: await sha256Hex(new Uint8Array(pdfBytes)),
        retrievedAt: '2026-10-30T15:00:00.000Z',
        versions: [{ id: 3, versionNo: 2, status: 'published' }],
      }),
    ])

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')
    await user.upload(screen.getByLabelText('File'), pdfFile())

    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('This file was already loaded')
    expect(warning.textContent).toContain('Oct 30, 2026')
    expect(warning.textContent).toContain('as version 2')
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(api.uploads).toEqual([])
  })

  it('edits a stored file’s title, URL and date', async () => {
    const api = fakeSourcesApi([source(7, { title: 'GA list' }), source(8, { title: 'Other' })])

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')
    const table = await screen.findByRole('table', { name: 'Stored files for Montana' })
    await user.click(within(table).getByRole('button', { name: 'Edit details of “GA list”' }))

    const form = screen.getByRole('form', { name: 'Edit details of “GA list”' })
    expect(within(form).getByLabelText<HTMLInputElement>('Title').value).toBe('GA list')
    await user.type(within(form).getByLabelText('State’s URL for this file'), 'http://dch.ga.gov')
    await user.click(within(form).getByRole('button', { name: 'Save details' }))
    expect(within(form).getByText('Enter a full https:// address.')).toBeTruthy()
    expect(api.edits).toEqual([])

    await user.clear(within(form).getByLabelText('State’s URL for this file'))
    await user.type(
      within(form).getByLabelText('State’s URL for this file'),
      'https://dch.ga.gov/a.pdf',
    )
    await user.type(within(form).getByLabelText('Date on the document'), '2026-07-01')
    await user.click(within(form).getByRole('button', { name: 'Save details' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      'Saved the details of “GA list”',
    )
    expect(api.edits).toEqual([
      {
        id: '7',
        body: { title: 'GA list', url: 'https://dch.ga.gov/a.pdf', publisherDate: '2026-07-01' },
      },
    ])
    expect(screen.queryByRole('form', { name: 'Edit details of “GA list”' })).toBeNull()
    expect(await within(table).findByRole('link', { name: 'State’s copy' })).toBeTruthy()
    expect(table.textContent).toContain('Jul 1, 2026')
  })

  it('cancels an edit without saving', async () => {
    const api = fakeSourcesApi([source(7, { title: 'GA list' })])

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')
    await user.click(await screen.findByRole('button', { name: 'Edit details of “GA list”' }))
    const form = screen.getByRole('form', { name: 'Edit details of “GA list”' })
    await user.type(within(form).getByLabelText('Title'), ' changed')
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('form', { name: 'Edit details of “GA list”' })).toBeNull()
    expect(api.edits).toEqual([])
    expect(screen.getByText('GA list')).toBeTruthy()
  })

  it('refuses a file type we cannot parse, before hashing or uploading', async () => {
    const api = fakeSourcesApi([])
    // As if dropped or picked with "All files": the picker's accept filter is only a hint.
    user = userEvent.setup({ applyAccept: false })

    await renderRoute('/admin/sources')
    await chooseState(user, 'Montana')
    await user.upload(
      screen.getByLabelText('File'),
      new File(['x'], 'list.docx', { type: 'application/msword' }),
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Use a PDF, Excel (.xlsx), CSV, JSON or text file',
    )
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(api.uploads).toEqual([])
  })
})
