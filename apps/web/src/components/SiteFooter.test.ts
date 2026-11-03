import {
  AMA_NOTICE_SHORT,
  FOOTER_TEXT,
  footerLinks,
  HOME_INTRO,
  learnMore,
  STATUTE_URL,
} from '@mfcd/shared'
import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/msw-server'
import { renderApp } from '../test/render-route'

// The footer and the home page's context (M6 step 3b; links and the data date since M8 step 4):
// where the data comes from, that the site decides no one's eligibility, a link to the law, the
// About and policy pages, the source code, the issue form and when the data last changed. The
// Worker's HTML says the same.

const published = (updatedAt: string | null) => ({
  versionNo: 1,
  sourceDate: '2026-09-01',
  updatedAt,
  totalEntries: 1,
  bySystem: {
    icd10cm: 1,
    icd10pcs: 0,
    cpt: 0,
    hcpcs: 0,
    ndc: 0,
    revenue: 0,
    drug_class: 0,
    other: 0,
  },
  byFederalCategory: {
    blind_or_disabled: 0,
    sud: 1,
    disabling_mental_disorder: 0,
    physical_idd_adl: 0,
    serious_complex_medical: 0,
    state_specific: 0,
    unmapped: 0,
  },
  byQualification: { standalone: 1, needs_support: 0, supporting_only: 0, unknown: 0 },
  mappingsConfirmed: true,
})

function statesWith(items: unknown[]) {
  server.use(http.get('/api/public/states', () => HttpResponse.json({ dataVersion: 1, items })))
}

describe('site footer', () => {
  it('says what the site is not, with no patient data, and links the law', async () => {
    statesWith([])
    await renderApp('/')
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain(FOOTER_TEXT)
    expect(footer.textContent).toContain(AMA_NOTICE_SHORT)
    expect(within(footer).getByRole('link', { name: 'Read the law' }).getAttribute('href')).toBe(
      STATUTE_URL,
    )
  })

  it('links About, the policy pages, the source code and the issue form', async () => {
    statesWith([])
    await renderApp('/about')
    const nav = within(screen.getByRole('contentinfo')).getByRole('navigation', {
      name: 'About this site',
    })
    for (const link of footerLinks) {
      expect(within(nav).getByRole('link', { name: link.text }).getAttribute('href')).toBe(
        link.href,
      )
    }
  })

  it('says when the data last changed: the newest list update across states', async () => {
    statesWith([
      {
        id: 'GA',
        slug: 'ga',
        name: 'Georgia',
        fips: '13',
        status: 'published',
        published: published('2026-10-01T10:00:00Z'),
      },
      {
        id: 'MT',
        slug: 'mt',
        name: 'Montana',
        fips: '30',
        status: 'published',
        published: published('2026-11-02T10:00:00Z'),
      },
      { id: 'OH', slug: 'oh', name: 'Ohio', fips: '39', status: 'none', published: null },
    ])
    await renderApp('/privacy')
    const footer = screen.getByRole('contentinfo')
    expect(await within(footer).findByText('Data last updated November 2, 2026')).toBeTruthy()
  })

  it('gives the home page the law, what the site does not do, and a learn-more link', async () => {
    statesWith([])
    await renderApp('/')
    expect(await screen.findByText(HOME_INTRO, { exact: false })).toBeTruthy()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Read the law' }).getAttribute('href')).toBe(
      STATUTE_URL,
    )
    expect(within(main).getByRole('link', { name: learnMore.home.text }).getAttribute('href')).toBe(
      learnMore.home.href,
    )
  })
})
