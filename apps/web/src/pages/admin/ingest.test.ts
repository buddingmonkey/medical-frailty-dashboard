import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { qualificationBasisLabels } from '@mfcd/shared'

import { makePdf } from '../../ingest/fixtures/make-pdf'
import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// Louisiana's real header row (docs/sources.md); code is the last column.
const laPaste = [
  'Category\tSub-Category\tGroup\tCode Designation\tDescription\tCode',
  'Mental Health\tSMI\tG1\t0\tSchizophrenia\tF20.0',
  'Mental Health\tSMI\tG1\t2\tDepression\tF32.9',
  '\t\t\t\t\t',
  'Physical\t\tG2\t1\tNo code here\t',
].join('\n')

interface Saved {
  stateId: string
  header: string[]
  profile: unknown
}

/** What ref_codes holds in these tests. */
const cms: Record<string, 'icd10cm' | 'hcpcs'> = { A0103: 'icd10cm', E09349: 'icd10cm' }

function fakeApi(savedProfile: unknown = null) {
  const saves: Saved[] = []
  const lookups: string[][] = []
  const draftSources: unknown[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({
        items: [
          { id: 'LA', name: 'Louisiana', status: 'none' },
          { id: 'MT', name: 'Montana', status: 'none' },
        ],
      }),
    ),
    http.get('/api/admin/column-profiles', () =>
      HttpResponse.json({
        item:
          savedProfile === null
            ? null
            : {
                headerKey: 'x',
                profile: savedProfile,
                updatedBy: 'admin@example.org',
                updatedAt: '2026-10-30T15:00:00.000Z',
              },
      }),
    ),
    http.put('/api/admin/column-profiles', async ({ request }) => {
      saves.push((await request.json()) as Saved)
      return HttpResponse.json({ ok: true })
    }),
    http.get('/api/admin/sources', () =>
      HttpResponse.json({
        items: [
          {
            id: 11,
            stateId: 'LA',
            title: 'Louisiana HR1 codes',
            url: null,
            publisherDate: '2026-07-21',
            retrievedAt: '2026-11-01T12:00:00.000Z',
            fileType: 'pdf',
            sha256: 'a'.repeat(64),
            byteSize: 10,
            uploadedBy: 'admin@example.org',
            versions: [],
          },
        ],
      }),
    ),
    http.get('/api/admin/drafts', () => HttpResponse.json({ items: [] })),
    http.post('/api/admin/drafts', () =>
      HttpResponse.json(
        {
          item: {
            id: 4,
            stateId: 'LA',
            versionNo: 1,
            status: 'draft',
            label: null,
            createdBy: 'admin@example.org',
            createdAt: '2026-11-02T14:00:00.000Z',
            rowCount: 0,
          },
        },
        { status: 201 },
      ),
    ),
    http.put('/api/admin/drafts/4/sources/11', async ({ request }) => {
      draftSources.push(await request.json())
      return HttpResponse.json({ ok: true })
    }),
    http.post('/api/admin/drafts/4/rows', () => HttpResponse.json({ ok: true, stored: 2 })),
    http.post('/api/admin/ref-codes/lookup', async ({ request }) => {
      const { codes } = (await request.json()) as { codes: string[] }
      lookups.push(codes)
      const items = codes.flatMap((codeNorm) => {
        const codeSystem = cms[codeNorm]
        return codeSystem ? [{ codeNorm, codeSystem, billable: true }] : []
      })
      return HttpResponse.json({ items })
    }),
  )
  return { saves, lookups, draftSources }
}

let user: ReturnType<typeof userEvent.setup>

async function start(paste = laPaste) {
  await renderRoute('/admin/ingest')
  await screen.findByRole('option', { name: 'Louisiana' })
  await user.selectOptions(screen.getByLabelText('State'), 'Louisiana')
  await user.click(screen.getByLabelText('Paste a table'))
  await user.paste(paste)
  await user.click(screen.getByRole('button', { name: 'Read pasted table' }))
  await screen.findByRole('table', { name: 'Columns' })
}

const role = (header: string) => screen.getByLabelText(`Role of column “${header}”`)

describe('/admin/ingest', () => {
  beforeEach(() => {
    user = userEvent.setup()
  })

  it('guesses each column’s role from the header and shows sample values', async () => {
    fakeApi()
    await start()

    expect((role('Code') as HTMLSelectElement).value).toBe('code')
    expect((role('Code Designation') as HTMLSelectElement).value).toBe('qualification')
    expect((role('Group') as HTMLSelectElement).value).toBe('ignore')
    const columns = screen.getByRole('table', { name: 'Columns' })
    expect(within(columns).getByText('F20.0, F32.9')).toBeTruthy()
  })

  it('reads Indiana’s “Federal category” column as the state’s own federal category', async () => {
    fakeApi()
    await start(
      'Diagnosis code\tDescription\tHigh-level condition\tFederal category\n' +
        'C9021\tLeukemia\tLeukemia\tSerious or complex medical condition\n',
    )
    expect((role('Federal category') as HTMLSelectElement).value).toBe('stateFederal')
    expect(
      within(role('Federal category')).getByRole('option', {
        name: 'Federal category (the state’s own)',
      }),
    ).toBeTruthy()
  })

  it('maps rows, reports skipped rows and values the rule does not cover', async () => {
    fakeApi()
    await start()

    // A designation column exists, so the rule reads from it; nothing is mapped yet.
    expect(screen.getByText(/2 rows mapped/)).toBeTruthy()
    expect(screen.getByText(/1 blank row skipped/)).toBeTruthy()
    expect(screen.getByText(/1 row without a code: row 5/)).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toContain('0, 2')

    await user.selectOptions(screen.getByLabelText('Qualification for “0”'), 'standalone')
    await user.selectOptions(screen.getByLabelText('Qualification for “2”'), 'supporting_only')
    await user.click(screen.getByLabelText(qualificationBasisLabels.inferred))

    expect(screen.queryByRole('alert')).toBeNull()
    const preview = screen.getByRole('table', { name: 'Mapped rows (first 20)' })
    const rows = within(preview).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('F20.0')
    expect(rows[0]?.textContent).toContain(
      `Enough by itself (${qualificationBasisLabels.inferred})`,
    )
    expect(rows[1]?.textContent).toContain('Supporting only')
  })

  it('saves the column profile for the state and header layout', async () => {
    const api = fakeApi()
    await start()
    await user.selectOptions(screen.getByLabelText('Qualification for “0”'), 'standalone')
    await user.click(screen.getByRole('button', { name: 'Save column profile' }))

    expect((await screen.findByRole('status')).textContent).toContain('Saved')
    expect(api.saves).toEqual([
      {
        stateId: 'LA',
        header: ['Category', 'Sub-Category', 'Group', 'Code Designation', 'Description', 'Code'],
        profile: {
          roles: ['category', 'subcategory', 'ignore', 'qualification', 'description', 'code'],
          qualification: {
            mode: 'column',
            from: 'qualification',
            values: { '0': 'standalone' },
            basis: 'published',
          },
          defaultCategory: '',
          defaultTier: '',
        },
      },
    ])
  })

  it('uses a saved profile for the same layout', async () => {
    fakeApi({
      roles: ['category', 'ignore', 'subcategory', 'qualification', 'description', 'code'],
      qualification: {
        mode: 'column',
        from: 'qualification',
        values: { '0': 'standalone', '1': 'needs_support', '2': 'supporting_only' },
        basis: 'inferred',
      },
      defaultCategory: '',
    })
    await start()

    expect(await screen.findByText(/Using the column profile saved on Oct 30, 2026/)).toBeTruthy()
    expect((role('Group') as HTMLSelectElement).value).toBe('subcategory')
    expect(screen.getByLabelText<HTMLSelectElement>('Qualification for “2”').value).toBe(
      'supporting_only',
    )
  })

  it('sets a tier for every row when the file has no tier column (Georgia)', async () => {
    fakeApi()
    await start('Code\tDescription\nF20.0\tSchizophrenia\n')
    await user.type(screen.getByLabelText('Tier for every row'), 'Attachment A')
    const preview = screen.getByRole('table', { name: 'Mapped rows (first 20)' })
    expect(within(preview).getByText('Attachment A')).toBeTruthy()
  })

  it('names a blank designation “(blank)” among the values with no qualification', async () => {
    fakeApi()
    await start(`${laPaste}\nPhysical\tSMI\tG2\t\tBlank designation\tF33.9`)
    expect(
      (await screen.findByText(/No qualification chosen for/)).textContent.replace(/\s+/g, ' '),
    ).toContain('No qualification chosen for: (blank), 0, 2.')
  })

  it('needs exactly one code column before it maps or saves', async () => {
    fakeApi()
    await start()
    await user.selectOptions(role('Code'), 'ignore')

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Choose exactly one code column',
    )
    expect(screen.queryByRole('table', { name: 'Mapped rows (first 20)' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Save column profile' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('reads a PDF, shows how wrapped lines were read, and re-reads them the other way', async () => {
    fakeApi()
    await renderRoute('/admin/ingest')
    await screen.findByRole('option', { name: 'Montana' })
    await user.selectOptions(screen.getByLabelText('State'), 'Montana')
    const pdf = makePdf([
      [
        { text: 'Montana Medically Frail Condition List', x: 40, y: 20, bold: true },
        { text: 'Code', x: 40, y: 50, bold: true },
        { text: 'Code Name', x: 120, y: 50, bold: true },
        { text: 'F20.0', x: 40, y: 70 },
        { text: 'Paranoid schizophrenia', x: 120, y: 70 },
        { text: 'with a second line', x: 120, y: 82 },
        { text: 'F20.1', x: 40, y: 104 },
        { text: 'Disorganized schizophrenia', x: 120, y: 104 },
      ],
    ])
    await user.upload(screen.getByLabelText('File'), new File([pdf], 'mt.pdf'))

    const rows = await screen.findByRole('table', { name: 'Mapped rows (first 20)' })
    expect(within(rows).getByText('Paranoid schizophrenia with a second line')).toBeTruthy()
    expect(within(rows).getByText('page 1, line 1')).toBeTruthy()
    // The title names the state; the send panel says so (the state-mismatch check reads it).
    expect(screen.getByText(/States named in the file: MT\./)).toBeTruthy()
    const wrap = screen.getByLabelText<HTMLSelectElement>('Wrapped lines')
    expect(wrap.value).toBe('auto')
    expect(wrap.selectedOptions[0]?.textContent).toContain('found: below the code')

    await user.selectOptions(wrap, 'above')
    // The select stays put (and keeps focus) while the file is read again.
    expect(screen.getByLabelText('Wrapped lines')).toBe(wrap)
    expect(
      await within(await screen.findByRole('table', { name: 'Mapped rows (first 20)' })).findByText(
        'with a second line Disorganized schizophrenia',
      ),
    ).toBeTruthy()
  })

  it('reviews the mapped rows, and starts the review again for a new file', async () => {
    fakeApi()
    // F20 sits on row 2 of both files, so a kept edit would show as "ready".
    await start('Code\tDescription\nF20\tSchizophrenia\nF20.0\tParanoid schizophrenia\n')
    const review = screen.getByRole('region', { name: 'Review rows' })
    expect(within(review).getByText(/2 rows: 1 ready, 1 needs a decision/)).toBeTruthy()
    await user.click(within(review).getByRole('button', { name: 'Whole category' }))
    expect(within(review).getByText(/2 rows: 2 ready/)).toBeTruthy()

    await user.upload(
      screen.getByLabelText('File'),
      new File(['Code,Code Name\nF20,Schizophrenia\n'], 'la.csv', { type: 'text/csv' }),
    )
    expect(await screen.findByText(/1 row: 0 ready, 1 needs a decision/)).toBeTruthy()
  })

  it('guesses that a list writes ICD-10-CM codes without dots, and asks CMS’s lists (NE)', async () => {
    const api = fakeApi()
    await start('Code\tDescription\nE09349\tDiabetes\nA0103\tTyphoid\nA9999\tUnknown\n')
    expect(screen.getByLabelText<HTMLInputElement>(/written without dots/).checked).toBe(true)
    // A0103 is only in ICD-10-CM, so the question “ICD-10-CM or HCPCS?” is settled.
    expect(await screen.findByText(/3 rows: 2 ready, 1 needs a decision/)).toBeTruthy()
    expect(api.lookups.flat().sort()).toEqual(['A0103', 'A9999', 'E09349'])

    // A fixed code is looked up too; codes already known are not asked again.
    const review = screen.getByRole('region', { name: 'Review rows' })
    await user.selectOptions(within(review).getByLabelText('Show'), 'All rows')
    await user.click(within(review).getByRole('button', { name: 'Edit row row 2' }))
    const code = screen.getByLabelText('Code')
    await user.clear(code)
    await user.type(code, 'E09.341')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(api.lookups.at(-1)).toEqual(['E09341'])
    })
    // E09.341 and the unknown A9999.
    expect(await screen.findAllByText('Not in the CMS code list for this system')).toHaveLength(2)
  })

  it('says when the codes could not be checked against CMS’s lists', async () => {
    fakeApi()
    server.use(
      http.post('/api/admin/ref-codes/lookup', () => HttpResponse.json({}, { status: 500 })),
    )
    await start()
    expect(await screen.findByText(/Could not check the codes against the CMS lists/)).toBeTruthy()
  })

  it('sends the reviewed rows of a pasted table to a new draft', async () => {
    const api = fakeApi()
    await start(`Louisiana list\tCode\nx\tF20.0\ny\tF31.0\n`)
    const panel = screen.getByRole('region', { name: 'Send to a draft' })
    expect(within(panel).getByText(/2 entries from 2 rows/)).toBeTruthy()
    await within(panel).findByRole('option', { name: 'Louisiana HR1 codes' })
    await user.selectOptions(within(panel).getByLabelText('Source document'), '11')
    await user.click(within(panel).getByRole('button', { name: 'Send to draft' }))
    expect(await within(panel).findByRole('link', { name: 'Open draft v1' })).toBeTruthy()
    // The header names Louisiana: the state-mismatch check gets it.
    expect(api.draftSources).toEqual([
      { part: 'Pasted table', expectedEntries: 2, invalidRowCount: 0, namedStateIds: ['LA'] },
    ])
  })

  it('reads an AI assistant’s answer for a file it cannot read, then maps it', async () => {
    fakeApi()
    server.use(
      http.get('/api/admin/ai-cleanup', () => HttpResponse.json({ enabled: false, model: null })),
    )
    await renderRoute('/admin/ingest')
    await screen.findByRole('option', { name: 'Montana' })
    await user.selectOptions(screen.getByLabelText('State'), 'Montana')
    // Text with no header row the adapters recognize.
    await user.upload(
      screen.getByLabelText('File'),
      new File(['\n'], 'mt.json', { type: 'application/json' }),
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    const panel = await screen.findByRole('region', { name: 'Get help from an AI assistant' })
    await user.click(within(panel).getByRole('button', { name: 'Prepare the prompt' }))
    await user.click(await within(panel).findByLabelText('The assistant’s answer'))
    await user.paste('{"rows":[{"code":"F20.0","description":"Paranoid schizophrenia"}]}')
    await user.click(within(panel).getByRole('button', { name: 'Read the answer' }))
    expect(await screen.findByText(/1 row mapped/)).toBeTruthy()
    expect((role('Code') as HTMLSelectElement).value).toBe('code')
  })

  it('reads a CSV file, and refuses a PDF it cannot read', async () => {
    fakeApi()
    await renderRoute('/admin/ingest')
    await screen.findByRole('option', { name: 'Montana' })
    await user.selectOptions(screen.getByLabelText('State'), 'Montana')

    await user.upload(
      screen.getByLabelText('File'),
      new File(['Code,Code Name\nF20.0,Schizophrenia\n'], 'mt.csv', { type: 'text/csv' }),
    )
    expect(await screen.findByText(/1 row mapped/)).toBeTruthy()

    await user.upload(screen.getByLabelText('File'), new File(['%PDF-'], 'mt.pdf'))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'mt.pdf is not a readable PDF.',
    )
    // A file that will not read points to the guide (and the AI assistant panel).
    expect(screen.getByRole('link', { name: 'the guide' }).getAttribute('href')).toBe(
      '/admin/guide',
    )
    expect(screen.queryByLabelText('Wrapped lines')).toBeNull()
  })
})
