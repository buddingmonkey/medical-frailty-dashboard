import { screen, within } from '@testing-library/vue'
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
  ],
  chapters,
}

function fakeApi() {
  const saves: unknown[] = []
  const chapterSaves: { path: string; body: unknown }[] = []
  server.use(
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
  return { saves, chapterSaves }
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
    expect(screen.getByText(/3 categories: 1 confirmed, 1 guessed, 1 not mapped/)).toBeTruthy()
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

  it('confirms one category with the chosen federal category', async () => {
    const { saves } = fakeApi()
    const table = await open()
    const row = rowOf(table, 'Miscellaneous')
    await user.selectOptions(
      within(row).getByLabelText('Federal category for Miscellaneous'),
      'state_specific',
    )
    await user.click(within(row).getByRole('button', { name: 'Confirm Miscellaneous' }))
    expect(saves).toEqual([
      {
        items: [
          {
            stateCategory: 'Miscellaneous',
            stateSubcategory: '',
            federalCategory: 'state_specific',
          },
        ],
      },
    ])
  })

  it('confirms every guess at once', async () => {
    const { saves } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'Confirm all 1 guesses' }))
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
  })

  it('sets a chapter override for chapters that have entries', async () => {
    const { chapterSaves } = fakeApi()
    await open()
    const chaptersTable = screen.getByRole('table', { name: 'ICD-10-CM chapters' })
    expect(within(chaptersTable).getAllByRole('row')).toHaveLength(2)
    await user.selectOptions(
      within(chaptersTable).getByLabelText(/Override for chapter 5/),
      'disabling_mental_disorder',
    )
    await user.click(within(chaptersTable).getByRole('button', { name: 'Save chapter 5' }))
    expect(chapterSaves).toEqual([
      {
        path: '/api/admin/states/LA/chapters/5',
        body: { federalCategory: 'disabling_mental_disorder' },
      },
    ])
  })
})
