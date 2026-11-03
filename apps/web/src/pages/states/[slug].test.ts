import {
  codeSystems,
  FEDERAL_OVERLAP_NOTE,
  federalCategories,
  learnMore,
  type PublicStateDetail,
  qualifications,
  REPORT_PROBLEM_URL,
  zeroCounts,
} from '@mfcd/shared'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// State detail page (roadmap M3 step 3).

const georgia: PublicStateDetail = {
  dataVersion: 4,
  state: {
    id: 'GA',
    slug: 'ga',
    name: 'Georgia',
    fips: '13',
    status: 'published',
    published: {
      versionNo: 2,
      sourceDate: '2026-09-15',
      updatedAt: '2026-11-02T16:00:00.000Z',
      totalEntries: 6047,
      bySystem: { ...zeroCounts(codeSystems), icd10cm: 6000, hcpcs: 47 },
      byFederalCategory: { ...zeroCounts(federalCategories), sud: 47, unmapped: 6000 },
      byQualification: { ...zeroCounts(qualifications), standalone: 6000, needs_support: 47 },
      mappingsConfirmed: false,
    },
  },
  notesMd: 'Georgia publishes **two** attachments.',
  sources: [
    {
      title: 'Attachment A',
      url: 'https://medicaid.georgia.gov/a.pdf',
      publisherDate: '2026-09-15',
      retrievedAt: '2026-11-01T12:00:00.000Z',
      fileType: 'pdf',
    },
    {
      title: 'Attachment B',
      url: null,
      publisherDate: null,
      retrievedAt: '2026-11-01T12:00:00.000Z',
      fileType: 'pdf',
    },
  ],
  versions: [
    {
      versionNo: 2,
      status: 'published',
      publishedAt: '2026-11-02T16:00:00.000Z',
      statePublishedDate: null,
      rowCount: 6047,
    },
    {
      versionNo: 1,
      status: 'superseded',
      publishedAt: '2026-11-01T16:00:00.000Z',
      statePublishedDate: null,
      rowCount: 6046,
    },
  ],
  categories: [
    {
      stateCategory: 'Mental health',
      stateSubcategory: 'Psychosis',
      federalCategory: 'disabling_mental_disorder',
      confirmed: true,
      entries: 47,
    },
    {
      stateCategory: '',
      stateSubcategory: '',
      federalCategory: 'unmapped',
      confirmed: false,
      entries: 6000,
    },
  ],
  similar: [
    {
      id: 'NE',
      slug: 'ne',
      name: 'Nebraska',
      jaccard: 0.6054,
      shared: 5874,
      onlyThis: 1558,
      onlyOther: 2271,
    },
    {
      id: 'LA',
      slug: 'la',
      name: 'Louisiana',
      jaccard: 0.2194,
      shared: 3032,
      onlyThis: 4400,
      onlyOther: 6387,
    },
    {
      id: 'MT',
      slug: 'mt',
      name: 'Montana',
      jaccard: 0.091,
      shared: 705,
      onlyThis: 6727,
      onlyOther: 314,
    },
    {
      id: 'TX',
      slug: 'tx',
      name: 'Texas',
      jaccard: 0.05,
      shared: 5,
      onlyThis: 6000,
      onlyOther: 90,
    },
  ],
}

function serve(slug: string, body: PublicStateDetail | null) {
  server.use(
    http.get(`/api/public/states/${slug}`, () =>
      body ? HttpResponse.json(body) : HttpResponse.json({ error: 'Not found' }, { status: 404 }),
    ),
  )
}

describe('/states/:slug', () => {
  it('says a code can count under more than one federal category when one does', async () => {
    const p = georgia.state.published
    if (!p) throw new Error('fixture has no list')
    const byFederalCategory = { ...p.byFederalCategory, serious_complex_medical: 10 }
    serve('ga', { ...georgia, state: { ...georgia.state, published: { ...p, byFederalCategory } } })

    await renderRoute('/states/ga')

    const counts = await screen.findByRole('table', { name: 'Entries by federal category' })
    expect(
      within(counts).getByRole('row', { name: 'Serious or complex medical condition 10' }),
    ).toBeTruthy()
    expect(screen.getByText(FEDERAL_OVERLAP_NOTE)).toBeTruthy()
  })

  it('shows the summary, counts, categories, sources, versions and notes', async () => {
    serve('ga', georgia)

    await renderRoute('/states/ga')

    expect(await screen.findByRole('heading', { level: 1, name: 'Georgia' })).toBeTruthy()
    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(summary.textContent).toContain('6,047')
    expect(summary.textContent).toContain('September 15, 2026')
    expect(summary.textContent).toContain('Version 2')

    const counts = screen.getByRole('table', { name: 'Entries by code system' })
    expect(within(counts).getByRole('row', { name: 'ICD-10-CM 6,000' })).toBeTruthy()
    expect(
      screen.getByRole('table', {
        name: 'Entries by the state’s rule on whether a code is enough by itself',
      }).textContent,
    ).toContain('Needs another code or documentation47')

    // Every entry counts under one federal category here, so no note.
    expect(screen.queryByText(FEDERAL_OVERLAP_NOTE)).toBeNull()

    const cats = screen.getByRole('table', { name: 'Georgia’s categories' })
    const rows = within(cats).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Mental health › Psychosis')
    expect(rows[0]?.textContent).toContain('Disabling mental disorder')
    expect(rows[0]?.textContent).toContain('Reviewed')
    expect(rows[1]?.textContent).toContain('(no category)')
    expect(rows[1]?.textContent).toContain('Not yet classified')
    expect(rows[1]?.textContent).toContain('Not yet reviewed (automatic suggestion)')
    // Each category opens the code table on it, with this state as the first column.
    const first = rows[0]
    if (!first) throw new Error('no category rows')
    expect(
      within(first)
        .getByRole('link', {
          name: 'Compare these codes (Mental health › Psychosis) with other states',
        })
        .getAttribute('href'),
    ).toBe(
      '/compare/codes?states=GA&ownState=GA&ownCategory=Mental+health&ownSubcategory=Psychosis',
    )

    const a = screen.getByRole('link', { name: 'Attachment A' })
    expect(a.getAttribute('href')).toBe('https://medicaid.georgia.gov/a.pdf')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('link', { name: 'Attachment B' })).toBeNull()
    expect(screen.getByText(/Attachment B/).textContent).toContain('link not known')

    const versions = screen.getByRole('table', { name: 'Version history' })
    expect(within(versions).getAllByRole('row')).toHaveLength(3)
    expect(versions.textContent).toContain('Current')
    expect(versions.textContent).toContain('Replaced')

    expect(screen.getByRole('link', { name: 'Georgia codes (CSV)' }).getAttribute('href')).toBe(
      '/states/ga/codes.csv',
    )
    expect(screen.getByRole('link', { name: 'Georgia codes (JSON)' }).getAttribute('href')).toBe(
      '/states/ga/codes.json',
    )
    expect(document.title).toBe('Georgia medical frailty codes | Medical Frailty Coding Dashboard')
    // Learn-more links to About (M8 step 4).
    for (const link of [learnMore.stateCategories, learnMore.downloads, learnMore.similarity]) {
      expect(screen.getByRole('link', { name: link.text }).getAttribute('href')).toBe(link.href)
    }

    expect(screen.getByText('two').tagName).toBe('STRONG')
  })

  it('says when a state has no list on the site yet', async () => {
    serve('mt', {
      dataVersion: 4,
      state: {
        id: 'MT',
        slug: 'mt',
        name: 'Montana',
        fips: '30',
        status: 'announced',
        published: null,
      },
      notesMd: null,
      sources: [],
      versions: [],
      categories: [],
      similar: [],
    })

    await renderRoute('/states/mt')

    expect(await screen.findByRole('heading', { level: 1, name: 'Montana' })).toBeTruthy()
    expect(screen.getByText(/Montana has announced a medical frailty code list/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(
      screen.getByText(/Know of a published medical frailty code list for Montana\?/),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tell us on GitHub' }).getAttribute('href')).toBe(
      REPORT_PROBLEM_URL,
    )
  })

  it('shows a not-found message for an unknown state', async () => {
    serve('zz', null)

    await renderRoute('/states/zz')

    expect(await screen.findByRole('heading', { level: 1, name: 'State not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See all states' }).getAttribute('href')).toBe(
      '/states',
    )
  })

  it('lists the states with the most similar lists, to compare with up to three', async () => {
    serve('ga', georgia)
    const user = userEvent.setup()
    const { router } = await renderRoute('/states/ga')

    const section = await screen.findByRole('region', {
      name: 'States with the most similar lists',
    })
    const list = within(section).getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/^Nebraska.*Similarity 0\.61/),
      expect.stringMatching(/^Louisiana.*Similarity 0\.22/),
      expect.stringMatching(/^Montana.*Similarity 0\.09/),
      expect.stringMatching(/^Texas.*Similarity 0\.05/),
    ])
    // One-click pairs.
    expect(
      within(section).getByRole('link', { name: 'Compare with Nebraska' }).getAttribute('href'),
    ).toBe('/compare/states/ga-vs-ne')

    const button = within(section).getByRole('button', { name: 'Compare Georgia with 0 states' })
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.click(within(section).getByRole('checkbox', { name: 'Montana' }))
    await user.click(within(section).getByRole('checkbox', { name: 'Nebraska' }))
    await user.click(within(section).getByRole('checkbox', { name: 'Louisiana' }))
    // Three chosen: the fourth waits.
    expect(within(section).getByRole('checkbox', { name: 'Texas' }).hasAttribute('disabled')).toBe(
      true,
    )
    const go = within(section).getByRole('button', { name: 'Compare Georgia with 3 states' })
    expect(go.hasAttribute('disabled')).toBe(false)
    await user.click(go)
    // The state first, then the others in list order.
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/states/ga-vs-ne-vs-la-vs-mt')
    })
  })

  it('says so when no similarity is known yet', async () => {
    serve('ga', { ...georgia, similar: [] })
    await renderRoute('/states/ga')
    const section = await screen.findByRole('region', {
      name: 'States with the most similar lists',
    })
    expect(section.textContent).toContain('No other state has a list to compare with yet.')
  })
})
