import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

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

function fakeApi(savedProfile: unknown = null) {
  const saves: Saved[] = []
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
  )
  return { saves }
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
    await user.click(screen.getByLabelText('Inferred by us'))

    expect(screen.queryByRole('alert')).toBeNull()
    const preview = screen.getByRole('table', { name: 'Mapped rows (first 20)' })
    const rows = within(preview).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('F20.0')
    expect(rows[0]?.textContent).toContain('Qualifies alone (Inferred by us)')
    expect(rows[1]?.textContent).toContain('Supporting evidence only')
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

  it('reads a CSV file, and explains file types that are not supported yet', async () => {
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
    expect((await screen.findByRole('alert')).textContent).toContain('PDF parsing is not built yet')
  })
})
