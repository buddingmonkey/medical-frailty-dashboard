import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const chapters = Array.from({ length: 22 }, (_, i) => ({
  chapter: i + 1,
  title:
    i === 4 ? 'Mental, Behavioral and Neurodevelopmental disorders' : `Chapter ${String(i + 1)}`,
  publishedEntries: i === 4 ? 120 : 0,
  draftEntries: 0,
  override: null,
}))

const data = {
  categories: [
    {
      stateCategory: 'SMI',
      stateSubcategory: '',
      publishedEntries: 200,
      draftEntries: 0,
      placedEntries: 150,
      placedFederal: ['disabling_mental_disorder', 'serious_complex_medical'],
      mapping: {
        federalCategory: 'disabling_mental_disorder',
        method: 'auto',
        confidence: 0.9,
        mappedBy: null,
        mappedAt: '2026-11-02T15:00:00.000Z',
      },
      suggestion: { federalCategory: 'disabling_mental_disorder', keyword: 'smi', confidence: 0.9 },
    },
    {
      stateCategory: 'SUD',
      stateSubcategory: '',
      publishedEntries: 50,
      draftEntries: 0,
      placedEntries: 0,
      placedFederal: [],
      mapping: {
        federalCategory: 'sud',
        method: 'manual',
        confidence: null,
        mappedBy: 'admin@example.org',
        mappedAt: '2026-11-02T15:00:00.000Z',
      },
      suggestion: { federalCategory: 'sud', keyword: 'sud', confidence: 0.9 },
    },
    {
      stateCategory: 'Miscellaneous',
      stateSubcategory: '',
      publishedEntries: 10,
      draftEntries: 2,
      placedEntries: 0,
      placedFederal: [],
      mapping: null,
      suggestion: null,
    },
    {
      // In open drafts only: publish has not stored its guess yet, and confirming it moves no
      // published entry.
      stateCategory: 'Tier 2',
      stateSubcategory: '',
      publishedEntries: 0,
      draftEntries: 3,
      placedEntries: 0,
      placedFederal: [],
      mapping: null,
      suggestion: { federalCategory: 'state_specific', keyword: 'tier', confidence: 0.5 },
    },
    {
      // A suggestion with published entries and no stored mapping: its entries are unmapped
      // now, so confirming it is a change and needs the preview.
      stateCategory: 'Cancer',
      stateSubcategory: '',
      publishedEntries: 5,
      draftEntries: 0,
      placedEntries: 0,
      placedFederal: [],
      mapping: null,
      suggestion: {
        federalCategory: 'serious_complex_medical',
        keyword: 'cancer',
        confidence: 0.9,
      },
    },
  ],
  chapters,
}

const previewBody = (token: string) => ({
  token,
  changes: [
    {
      kind: 'category',
      stateCategory: 'SMI',
      stateSubcategory: '',
      chapter: null,
      to: 'sud',
      entries: 200,
      moves: [{ from: 'disabling_mental_disorder', to: 'sud', n: 50 }],
      movingTotal: 50,
      already: 0,
      alreadyIn: [],
      placed: { n: 150, federal: ['serious_complex_medical'] },
      chapterOverride: [],
      sample: [
        {
          code: 'F20.0',
          description: 'Paranoid schizophrenia',
          from: ['disabling_mental_disorder'],
          to: ['sud'],
        },
      ],
      draftEntries: 3,
    },
    {
      kind: 'category',
      stateCategory: 'Miscellaneous',
      stateSubcategory: '',
      chapter: null,
      to: 'sud',
      entries: 10,
      moves: [{ from: 'unmapped', to: 'sud', n: 10 }],
      movingTotal: 10,
      already: 0,
      alreadyIn: [],
      placed: { n: 0, federal: [] },
      chapterOverride: [],
      sample: [],
      draftEntries: 0,
    },
  ],
  totals: [
    { federalCategory: 'sud', before: 50, after: 110 },
    { federalCategory: 'disabling_mental_disorder', before: 50, after: 0 },
  ],
})

function fakeApi(options: { staleFirst?: boolean } = {}) {
  const saves: unknown[] = []
  const chapterSaves: { path: string; body: unknown }[] = []
  const previews: unknown[] = []
  const remaps: unknown[] = []
  server.use(
    http.post('/api/admin/states/LA/categories/preview', async ({ request }) => {
      previews.push(await request.json())
      return HttpResponse.json(previewBody(`token-${String(previews.length)}`))
    }),
    http.post('/api/admin/states/LA/categories/remap', async ({ request }) => {
      remaps.push(await request.json())
      if (options.staleFirst === true && remaps.length === 1) {
        return HttpResponse.json({ error: 'Changed' }, { status: 409 })
      }
      return HttpResponse.json({ ok: true })
    }),
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({ items: [{ id: 'LA', name: 'Louisiana', status: 'published' }] }),
    ),
    http.get('/api/admin/states/LA/categories', () => HttpResponse.json(data)),
    http.put('/api/admin/states/LA/categories', async ({ request }) => {
      saves.push(await request.json())
      return HttpResponse.json({ ok: true })
    }),
    http.put('/api/admin/states/LA/chapters/:chapter', async ({ request }) => {
      chapterSaves.push({ path: new URL(request.url).pathname, body: await request.json() })
      return HttpResponse.json({ ok: true })
    }),
  )
  return { saves, chapterSaves, previews, remaps }
}

let user: ReturnType<typeof userEvent.setup>

async function open() {
  user = userEvent.setup()
  await renderRoute('/admin/categories')
  await screen.findByRole('option', { name: 'Louisiana' })
  await user.selectOptions(screen.getByLabelText('State'), 'LA')
  return screen.findByRole('table', { name: 'Categories of Louisiana' })
}

const rowOf = (table: HTMLElement, name: string) => {
  const row = within(table).getByRole('rowheader', { name }).closest('tr')
  if (!row) throw new Error(`no row ${name}`)
  return row
}

describe('/admin/categories', () => {
  it('shows each category’s mapping, and how many an admin has confirmed', async () => {
    fakeApi()
    const table = await open()
    expect(screen.getByText(/5 categories: 1 confirmed, 2 guessed, 2 not mapped/)).toBeTruthy()
    expect(within(rowOf(table, 'SMI')).getByText(/Guessed from “smi”/)).toBeTruthy()
    expect(within(rowOf(table, 'SUD')).getByText(/Confirmed by admin@example.org/)).toBeTruthy()
    expect(within(rowOf(table, 'Miscellaneous')).getByText('Not mapped')).toBeTruthy()
  })

  it('says which entries follow their unified categories instead of this mapping', async () => {
    fakeApi()
    const table = await open()
    expect(rowOf(table, 'SMI').textContent).toContain(
      '150 follow their unified categories: Disabling mental disorder; Serious or complex medical condition',
    )
    expect(rowOf(table, 'SUD').textContent).not.toContain('unified')
  })

  it('confirms a stored guess at once, since no entry moves', async () => {
    const { saves, previews } = fakeApi()
    const table = await open()
    await user.click(within(rowOf(table, 'SMI')).getByRole('button', { name: 'Confirm SMI' }))
    expect(saves).toEqual([
      {
        items: [
          {
            stateCategory: 'SMI',
            stateSubcategory: '',
            federalCategory: 'disabling_mental_disorder',
          },
        ],
      },
    ])
    expect(previews).toEqual([])
  })

  it('previews one row’s change as a one-item remap before saving it', async () => {
    const { saves, previews, remaps } = fakeApi()
    const table = await open()
    const row = rowOf(table, 'Miscellaneous')
    await user.selectOptions(
      within(row).getByLabelText('Federal category for Miscellaneous'),
      'state_specific',
    )
    await user.click(within(row).getByRole('button', { name: 'Preview change for Miscellaneous' }))
    const region = await screen.findByRole('region', { name: 'Check the remap before saving' })
    const one = {
      categories: [
        { stateCategory: 'Miscellaneous', stateSubcategory: '', federalCategory: 'state_specific' },
      ],
      chapters: [],
    }
    expect(previews).toEqual([one])
    await within(region).findByText(/50 entries will move/)
    await user.click(within(region).getByRole('button', { name: 'Save remap' }))
    expect(await screen.findByText('Remapped 1 item in Louisiana.')).toBeTruthy()
    expect(remaps).toEqual([{ ...one, token: 'token-1' }])
    expect(saves).toEqual([])
  })

  it('confirms every guess that moves no published entry at once, as many as the summary says', async () => {
    const { saves, previews } = fakeApi()
    await open()
    expect(screen.getByText(/2 guessed/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm all 2 guesses' }))
    expect(saves).toEqual([
      {
        items: [
          {
            stateCategory: 'SMI',
            stateSubcategory: '',
            federalCategory: 'disabling_mental_disorder',
          },
          { stateCategory: 'Tier 2', stateSubcategory: '', federalCategory: 'state_specific' },
        ],
      },
    ])
    expect(previews).toEqual([])
  })

  it('hides "Confirm all" when the summary counts no guesses', async () => {
    fakeApi()
    server.use(
      http.get('/api/admin/states/LA/categories', () =>
        HttpResponse.json({
          ...data,
          categories: data.categories.filter((c) => !['SMI', 'Tier 2'].includes(c.stateCategory)),
        }),
      ),
    )
    await open()
    expect(screen.getByText(/3 categories: 1 confirmed, 0 guessed, 2 not mapped/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Confirm all/ })).toBeNull()
  })

  it('confirms a draft-only category at once, and previews a suggestion with published entries', async () => {
    const { saves, previews } = fakeApi()
    const table = await open()
    await user.click(within(rowOf(table, 'Tier 2')).getByRole('button', { name: 'Confirm Tier 2' }))
    expect(saves).toEqual([
      {
        items: [
          { stateCategory: 'Tier 2', stateSubcategory: '', federalCategory: 'state_specific' },
        ],
      },
    ])
    await user.click(
      within(rowOf(table, 'Cancer')).getByRole('button', { name: 'Preview change for Cancer' }),
    )
    await screen.findByRole('region', { name: 'Check the remap before saving' })
    expect(previews).toHaveLength(1)
  })

  it('previews a chapter override change before saving it', async () => {
    const { chapterSaves, previews } = fakeApi()
    await open()
    const chaptersTable = screen.getByRole('table', { name: 'ICD-10-CM chapters' })
    expect(within(chaptersTable).getAllByRole('row')).toHaveLength(2)
    const button = within(chaptersTable).getByRole('button', {
      name: 'Preview change for chapter 5',
    })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.selectOptions(
      within(chaptersTable).getByLabelText(/Override for chapter 5/),
      'disabling_mental_disorder',
    )
    await user.click(button)
    const region = await screen.findByRole('region', { name: 'Check the remap before saving' })
    expect(previews).toEqual([
      { categories: [], chapters: [{ chapter: 5, federalCategory: 'disabling_mental_disorder' }] },
    ])
    await user.click(within(region).getByRole('button', { name: 'Cancel' }))
    expect(button).toBe(document.activeElement)
    expect(chapterSaves).toEqual([])
  })

  it('previews a bulk remap of the selected categories, then saves it with the token', async () => {
    const { previews, remaps, saves } = fakeApi()
    const table = await open()
    await user.click(within(rowOf(table, 'SMI')).getByRole('checkbox', { name: 'Select SMI' }))
    await user.click(
      within(rowOf(table, 'Miscellaneous')).getByRole('checkbox', { name: 'Select Miscellaneous' }),
    )
    expect(screen.getByText('2 selected')).toBeTruthy()
    await user.selectOptions(
      screen.getByLabelText('Federal category for the selected categories'),
      'sud',
    )
    await user.click(screen.getByRole('button', { name: 'Preview remap' }))
    const region = await screen.findByRole('region', { name: 'Check the remap before saving' })
    expect(previews).toEqual([
      {
        categories: [
          { stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' },
          { stateCategory: 'Miscellaneous', stateSubcategory: '', federalCategory: 'sud' },
        ],
        chapters: [],
      },
    ])
    expect(
      await within(region).findByText(
        '50 entries will move from Disabling mental disorder to Substance use disorder.',
      ),
    ).toBeTruthy()
    expect(
      within(region).getByText(
        '150 stay in Serious or complex medical condition because they are placed in a published unified category.',
      ),
    ).toBeTruthy()
    expect(within(region).getByText('And 3 entries in open drafts.')).toBeTruthy()
    expect(within(region).getByRole('rowheader', { name: 'F20.0' })).toBeTruthy()
    expect(document.activeElement?.textContent).toContain('Check the remap before saving')
    expect(saves).toEqual([])

    await user.click(within(region).getByRole('button', { name: 'Save remap' }))
    expect(await screen.findByText('Remapped 2 items in Louisiana.')).toBeTruthy()
    expect(remaps).toEqual([{ ...(previews[0] as object), token: 'token-1' }])
    expect(screen.queryByRole('region', { name: 'Check the remap before saving' })).toBeNull()
  })

  it('selects every category of the state at once, and cancels without saving', async () => {
    const { remaps } = fakeApi()
    const table = await open()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 5 categories of Louisiana' }))
    expect(screen.getByText('5 selected')).toBeTruthy()
    expect(
      within(table)
        .getAllByRole('checkbox')
        .every((c) => (c as HTMLInputElement).checked),
    ).toBe(true)
    await user.selectOptions(
      screen.getByLabelText('Federal category for the selected categories'),
      'state_specific',
    )
    await user.click(screen.getByRole('button', { name: 'Preview remap' }))
    const region = await screen.findByRole('region', { name: 'Check the remap before saving' })
    await within(region).findByText(/50 entries will move/)
    await user.click(within(region).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Check the remap before saving' })).toBeNull()
    expect(remaps).toEqual([])
    // The selection stays, so the admin can change the choice and preview again.
    expect(screen.getByText('5 selected')).toBeTruthy()
  })

  it('previews again when the data changed since the preview, and saves the new token', async () => {
    const { previews, remaps } = fakeApi({ staleFirst: true })
    const table = await open()
    await user.click(within(rowOf(table, 'SMI')).getByRole('checkbox', { name: 'Select SMI' }))
    await user.selectOptions(
      screen.getByLabelText('Federal category for the selected categories'),
      'sud',
    )
    await user.click(screen.getByRole('button', { name: 'Preview remap' }))
    const region = await screen.findByRole('region', { name: 'Check the remap before saving' })
    await within(region).findByText(/50 entries will move/)
    await user.click(within(region).getByRole('button', { name: 'Save remap' }))
    expect(await within(region).findByText(/Something changed since the preview/)).toBeTruthy()
    await waitFor(() => {
      expect(previews).toHaveLength(2)
    })
    await waitFor(() => {
      expect(within(region).getByRole('button', { name: 'Save remap' })).toHaveProperty(
        'disabled',
        false,
      )
    })
    await user.click(within(region).getByRole('button', { name: 'Save remap' }))
    expect(await screen.findByText('Remapped 1 item in Louisiana.')).toBeTruthy()
    expect(remaps.map((r) => (r as { token: string }).token)).toEqual(['token-1', 'token-2'])
  })

  it('previews bulk chapter overrides, including back to the category mapping', async () => {
    const { previews } = fakeApi()
    await open()
    const chaptersTable = screen.getByRole('table', { name: 'ICD-10-CM chapters' })
    await user.click(within(chaptersTable).getByRole('checkbox', { name: /Select chapter 5/ }))
    await user.selectOptions(
      screen.getByLabelText('Override for the selected chapters'),
      'Use the category mapping',
    )
    await user.click(screen.getByRole('button', { name: 'Preview chapter overrides' }))
    await screen.findByRole('region', { name: 'Check the remap before saving' })
    expect(previews).toEqual([
      { categories: [], chapters: [{ chapter: 5, federalCategory: null }] },
    ])
  })
})
