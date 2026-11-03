import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { strToU8, zipSync } from 'fflate'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const sha = (c: string) => c.repeat(64)

const entryRow = (id: number, versionId: number, rawCode: string, codeNorm: string) => ({
  id,
  versionId,
  codeSystem: 'icd10cm',
  rawCode,
  codeNorm,
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: 0,
  descriptionPublished: `Text of ${rawCode}`,
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: null,
  attributesJson: '{"included":true,"flags":[]}',
  qualification: 'standalone',
  qualificationBasis: 'published',
  sourceDocumentId: 4,
  sourceLocator: 'row 1',
  sourcePart: 'Table 1',
})

const versionRow = (id: number, versionNo: number, status: string) => ({
  id,
  stateId: 'MT',
  versionNo,
  status,
  label: null,
  effectiveDate: null,
  statePublishedDate: null,
  publishedAt: '2026-10-02T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  rowCount: 2,
})

const source = {
  id: 4,
  stateId: 'MT',
  title: 'Montana frailty codes',
  url: 'https://example.gov/mt.pdf',
  publisherDate: '2026-09-01',
  sha256: sha('a'),
  fileType: 'pdf',
  byteSize: 100,
}

function fullBackup() {
  return {
    format: 2,
    writtenAt: '2026-11-03T12:00:00.000Z',
    environment: 'production',
    migration: '0014_seed_condition_groups',
    dataVersion: 9,
    notes: [],
    tables: {
      app_meta: [],
      states: [{ id: 'MT', name: 'Montana' }],
      source_documents: [source],
      column_profiles: [],
      dataset_versions: [versionRow(2, 2, 'published'), versionRow(1, 1, 'superseded')],
      version_sources: [
        { versionId: 2, sourceDocumentId: 4 },
        { versionId: 1, sourceDocumentId: 4 },
      ],
      draft_parts: [],
      entries: [
        entryRow(10, 2, 'F20.0', 'F200'),
        entryRow(11, 2, 'F31.0', 'F310'),
        entryRow(5, 1, 'F20.0', 'F200'),
      ],
      category_mappings: [
        {
          stateId: 'MT',
          stateCategory: 'SMI',
          stateSubcategory: '',
          federalCategory: 'disabling_mental_disorder',
          method: 'manual',
          confidence: null,
          mappedBy: 'old@example.org',
          mappedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      chapter_mappings: [],
      unified_categories: [],
      unified_ccsr: [],
      unified_mappings: [],
      condition_groups: [],
      condition_members: [],
      watch_items: [],
      audit_log: [],
    },
    complete: true,
  }
}

const zipFile = (json: unknown, name = 'frailty-backup-production-20261103T120000Z.json') =>
  new File([zipSync({ [name]: strToU8(JSON.stringify(json)) })], name.replace('.json', '.zip'), {
    type: 'application/zip',
  })

function fakeApi() {
  const calls: { method: string; path: string; body: unknown }[] = []
  const record = async (request: Request) => {
    calls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: await request.json(),
    })
  }
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/maintenance', () => HttpResponse.json({ last: null, weekly: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({ items: [{ id: 'MT', name: 'Montana', status: 'published' }] }),
    ),
    http.get('/api/admin/backup/mappings', () =>
      HttpResponse.json({ categoryMappings: [], chapterMappings: [], columnProfiles: [] }),
    ),
    http.post('/api/admin/backup/sources', async ({ request }) => {
      await record(request)
      return HttpResponse.json({ sourceDocumentId: 40, reused: false }, { status: 201 })
    }),
    http.post('/api/admin/drafts', async ({ request }) => {
      await record(request)
      return HttpResponse.json(
        {
          item: {
            id: 77,
            stateId: 'MT',
            versionNo: 3,
            status: 'draft',
            label: null,
            createdBy: 'admin@example.org',
            createdAt: '2026-11-03T13:00:00.000Z',
            rowCount: 0,
          },
        },
        { status: 201 },
      )
    }),
    http.put('/api/admin/drafts/77/sources/40', async ({ request }) => {
      await record(request)
      return HttpResponse.json({ ok: true })
    }),
    http.post('/api/admin/drafts/77/rows', async ({ request }) => {
      await record(request)
      return HttpResponse.json({ ok: true, stored: 2 })
    }),
    http.put('/api/admin/backup/mappings/MT', async ({ request }) => {
      await record(request)
      return HttpResponse.json({ ok: true })
    }),
  )
  return calls
}

describe('/admin/restore', () => {
  it('offers the full download as a link', async () => {
    fakeApi()
    await renderRoute('/admin/restore')
    const link = await screen.findByRole('link', { name: 'Download backup' })
    expect(link.getAttribute('href')).toBe('/api/admin/backup')
    expect(link.hasAttribute('download')).toBe(true)
    expect(
      screen.getByRole('link', { name: 'Backup and restore' }).getAttribute('aria-current'),
    ).toBe('page')
  })

  it('reads a full backup zip and sends the chosen version to a new draft', async () => {
    const calls = fakeApi()
    const user = userEvent.setup()
    await renderRoute('/admin/restore')
    await user.upload(await screen.findByLabelText('Backup file'), zipFile(fullBackup()))

    const summary = await screen.findByRole('region', { name: /What is in frailty-backup/ })
    expect(summary.textContent).toContain('Full backup (format 2)')
    expect(summary.textContent).toContain('1 state, 2 versions, 3 entries')
    expect(summary.textContent).toContain('production')

    await user.selectOptions(screen.getByLabelText('State'), 'MT')
    // The version public when the backup was written is chosen first.
    const version = screen.getByLabelText<HTMLSelectElement>('Version')
    expect(version.selectedOptions[0]?.textContent).toMatch(/v2, public then, 2 entries/)
    expect(screen.getByText(/v2 of Montana: 2 entries in 1 part/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Create draft from v2' }))
    expect(await screen.findByText(/Draft v3 holds 2 restored entries/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open draft v3' }).getAttribute('href')).toBe(
      '/admin/drafts/77',
    )

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/admin/backup/sources',
      'POST /api/admin/drafts',
      'PUT /api/admin/drafts/77/sources/40',
      'POST /api/admin/drafts/77/rows',
    ])
    expect(calls[0]?.body).toMatchObject({ stateId: 'MT', sha256: sha('a'), fileType: 'pdf' })
    expect(calls[1]?.body).toMatchObject({
      stateId: 'MT',
      fromBackup: {
        writtenAt: '2026-11-03T12:00:00.000Z',
        environment: 'production',
        versionNo: 2,
      },
    })
    expect(calls[2]?.body).toEqual({
      part: 'Table 1',
      expectedEntries: 2,
      invalidRowCount: 0,
      namedStateIds: [],
    })
    const rows = calls[3]?.body as { entries: { rawCode: string }[] }
    expect(rows.entries.map((e) => e.rawCode)).toEqual(['F20.0', 'F31.0'])
  })

  it('shows the mapping diff before restoring mappings, and restores them only when ticked', async () => {
    const calls = fakeApi()
    const user = userEvent.setup()
    await renderRoute('/admin/restore')
    await user.upload(await screen.findByLabelText('Backup file'), zipFile(fullBackup()))
    await user.selectOptions(await screen.findByLabelText('State'), 'MT')

    await user.click(
      screen.getByRole('checkbox', { name: /Also replace Montana’s category mappings/ }),
    )
    const diff = await screen.findByRole('table', { name: 'Mapping changes' })
    expect(within(diff).getAllByRole('row')[1]?.textContent).toContain('Added')
    expect(within(diff).getAllByRole('row')[1]?.textContent).toContain('Category “SMI”')

    await user.click(screen.getByRole('button', { name: 'Create draft from v2' }))
    expect(await screen.findByText(/Mappings restored/)).toBeTruthy()
    const put = calls.find((c) => c.path === '/api/admin/backup/mappings/MT')
    expect(put?.body).toMatchObject({ categoryMappings: [{ stateCategory: 'SMI' }] })
  })

  it('reads a per-publish .json backup (format 1), which has no mappings', async () => {
    fakeApi()
    const user = userEvent.setup()
    await renderRoute('/admin/restore')
    const file = {
      format: 1,
      writtenAt: '2026-11-01T00:00:00.000Z',
      version: versionRow(1, 1, 'published'),
      sources: [{ id: 4, title: source.title, url: null, publisherDate: null, sha256: sha('a') }],
      parts: [],
      entries: [entryRow(5, 1, 'F20.0', 'F200')],
    }
    await user.upload(
      await screen.findByLabelText('Backup file'),
      new File([JSON.stringify(file)], '1.json', { type: 'application/json' }),
    )
    expect(await screen.findByText('One version, before a publish (format 1)')).toBeTruthy()
    // One version in the file: its state is chosen already.
    expect(screen.getByLabelText<HTMLSelectElement>('State').value).toBe('MT')
    expect(screen.getByText(/v1 of Montana: 1 entries/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('refuses an unknown format, a zip with two files and a version that would fail', async () => {
    fakeApi()
    const user = userEvent.setup()
    await renderRoute('/admin/restore')
    const input = await screen.findByLabelText('Backup file')

    await user.upload(input, new File(['{"format":7}'], 'x.json', { type: 'application/json' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Unknown backup format 7')

    const two = new File(
      [zipSync({ 'a.json': strToU8('{}'), 'b.json': strToU8('{}') })],
      'two.zip',
      { type: 'application/zip' },
    )
    await user.upload(input, two)
    expect((await screen.findByRole('alert')).textContent).toContain('exactly one .json file')

    const bad = fullBackup()
    bad.tables.entries[0] = { ...entryRow(10, 2, 'F20.0', 'F999') }
    await user.upload(input, zipFile(bad))
    await user.selectOptions(await screen.findByLabelText('State'), 'MT')
    expect((await screen.findByRole('alert')).textContent).toContain(
      '“F20.0” does not match the code sent with it.',
    )
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Create draft from v2' }).disabled,
    ).toBe(true)
  })
})
