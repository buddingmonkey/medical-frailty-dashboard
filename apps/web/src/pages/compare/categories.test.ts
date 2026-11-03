import type { OverviewCategory, PublicOverviewResponse } from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// The Categories tab (project lead, 2026-11-02): every published unified category under its
// federal category, each linking to its page, with its definition. Data: the overview.

const category = (
  id: number,
  slug: string,
  label: string,
  federalCategory: OverviewCategory['federalCategory'],
  definition: string,
): OverviewCategory => ({
  id,
  slug,
  label,
  definition,
  federalCategory,
  sortOrder: id,
  coverageBasis: 'universe',
  denominator: 10,
})

const overview: PublicOverviewResponse = {
  dataVersion: 2,
  categories: [
    category(1, 'psychoses', 'Psychoses', 'disabling_mental_disorder', 'Schizophrenia and more.'),
    category(2, 'mood', 'Mood disorders', 'disabling_mental_disorder', ''),
    category(3, 'kidney-failure', 'Kidney failure', 'serious_complex_medical', 'End-stage.'),
  ],
  states: [],
}

function serve(body: PublicOverviewResponse) {
  server.use(http.get('/api/public/overview', () => HttpResponse.json(body)))
}

describe('categories page', () => {
  it('groups every category under its federal category, linking each to its page', async () => {
    serve(overview)
    await renderRoute('/compare/categories')

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Categories we compare states by',
    })
    // The tabs sit under the heading.
    const tabs = screen.getByRole('navigation', { name: 'Compare views' })
    expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const mental = await screen.findByRole('region', { name: 'Disabling mental disorder' })
    expect(
      within(mental)
        .getAllByRole('link')
        .map((l) => [l.textContent.trim(), l.getAttribute('href')]),
    ).toEqual([
      ['Psychoses', '/compare/psychoses'],
      ['Mood disorders', '/compare/mood'],
    ])
    expect(within(mental).getByText('Schizophrenia and more.')).toBeTruthy()

    const medical = screen.getByRole('region', { name: 'Serious or complex medical condition' })
    expect(within(medical).getByRole('link', { name: 'Kidney failure' })).toBeTruthy()
    expect(within(medical).getByText('End-stage.')).toBeTruthy()
    expect(document.title).toMatch(/^Categories we compare states by \| /)
  })

  it('says so when no category is published yet', async () => {
    serve({ ...overview, categories: [] })
    await renderRoute('/compare/categories')
    expect(await screen.findByText('No categories are published yet.')).toBeTruthy()
  })

  it('says so when the data cannot be loaded', async () => {
    server.use(
      http.get('/api/public/overview', () => HttpResponse.json({ error: 'x' }, { status: 500 })),
    )
    await renderRoute('/compare/categories')
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/)
  })
})
