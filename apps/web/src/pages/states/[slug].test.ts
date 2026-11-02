import {
  codeSystems,
  federalCategories,
  type PublicStateDetail,
  qualifications,
  zeroCounts,
} from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
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
}

function serve(slug: string, body: PublicStateDetail | null) {
  server.use(
    http.get(`/api/public/states/${slug}`, () =>
      body ? HttpResponse.json(body) : HttpResponse.json({ error: 'Not found' }, { status: 404 }),
    ),
  )
}

describe('/states/:slug', () => {
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
      screen.getByRole('table', { name: 'Entries by whether a code qualifies alone' }).textContent,
    ).toContain('Needs another code47')

    const cats = screen.getByRole('table', { name: 'Georgia’s categories' })
    const rows = within(cats).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Mental health › Psychosis')
    expect(rows[0]?.textContent).toContain('Disabling mental disorder')
    expect(rows[0]?.textContent).toContain('Confirmed')
    expect(rows[1]?.textContent).toContain('(no category)')
    expect(rows[1]?.textContent).toContain('Unclassified')
    expect(rows[1]?.textContent).toContain('Not yet confirmed')
    // Each category opens the compare page on it, with this state as the first column.
    const first = rows[0]
    if (!first) throw new Error('no category rows')
    expect(
      within(first)
        .getByRole('link', { name: 'Compare Mental health › Psychosis with other states' })
        .getAttribute('href'),
    ).toBe('/compare?states=GA&ownState=GA&ownCategory=Mental+health&ownSubcategory=Psychosis')

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
    })

    await renderRoute('/states/mt')

    expect(await screen.findByRole('heading', { level: 1, name: 'Montana' })).toBeTruthy()
    expect(screen.getByText(/Montana has announced a list/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a not-found message for an unknown state', async () => {
    serve('zz', null)

    await renderRoute('/states/zz')

    expect(await screen.findByRole('heading', { level: 1, name: 'State not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See all states' }).getAttribute('href')).toBe('/')
  })
})
