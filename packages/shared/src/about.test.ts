import { describe, expect, it } from 'vitest'

import {
  aboutPage,
  type AboutBlock,
  type AboutInline,
  dataLastUpdated,
  dataUpdatedText,
  footerLinks,
  infoPages,
  learnMore,
  REPORT_PROBLEM_URL,
  reportListText,
  SOURCE_CODE_URL,
} from './index'

// The About/methodology, disclaimer, privacy and accessibility pages (roadmap M8 step 4): the
// words are data, shared by the Vue pages and the Worker's HTML.

function inlines(blocks: readonly AboutBlock[]): AboutInline[] {
  return blocks.flatMap((b) => {
    if (b.kind === 'p') return [...b.parts]
    if (b.kind === 'ul') return b.items.flat()
    return b.items.flatMap((i) => [i.term, ...i.parts])
  })
}

const everyLink = infoPages.flatMap((page) =>
  inlines([...page.intro, ...page.sections.flatMap((s) => s.blocks)]).filter(
    (part): part is Exclude<AboutInline, string> => typeof part !== 'string',
  ),
)

/** The section ids of an info page, by path. */
const idsOf = (path: string) =>
  new Set(infoPages.find((p) => p.path === path)?.sections.map((s) => s.id) ?? [])

/** Whether an internal link (`/about#matching`) names a page and, if any, a section on it. */
function resolves(href: string): boolean {
  const [path = '', hash] = href.split('#')
  const page = infoPages.find((p) => p.path === path)
  if (!page) return false
  return hash === undefined || idsOf(path).has(hash)
}

describe('info pages', () => {
  it('has the four pages, each with a title, description and heading', () => {
    expect(infoPages.map((p) => p.path)).toEqual([
      '/about',
      '/disclaimer',
      '/privacy',
      '/accessibility',
    ])
    for (const page of infoPages) {
      expect(page.title, page.path).toContain('Medical Frailty Coding Dashboard')
      expect(page.description.length, page.path).toBeGreaterThan(50)
      expect(page.description.length, page.path).toBeLessThanOrEqual(300)
      expect(page.heading, page.path).not.toBe('')
    }
  })

  it('gives About every section other pages link to, with no duplicate ids', () => {
    const ids = aboutPage.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'what-this-is',
      'sources',
      'matching',
      'like-codes',
      'badges',
      'categories',
      'review',
      'coverage',
      'similarity',
      'downloads',
      'court-rulings',
      'cpt',
      'report',
    ]) {
      expect(ids, id).toContain(id)
    }
    for (const page of infoPages) {
      const pageIds = page.sections.map((s) => s.id)
      expect(new Set(pageIds).size, page.path).toBe(pageIds.length)
      for (const id of pageIds) expect(id, page.path).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('every learn-more link goes to a section that exists', () => {
    for (const [place, link] of Object.entries(learnMore)) {
      expect(resolves(link.href), `${place}: ${link.href}`).toBe(true)
      expect(link.text, place).not.toBe('')
    }
  })

  it('every internal link inside the pages resolves', () => {
    for (const link of everyLink) {
      if (link.href.startsWith('/about') || link.href.startsWith('/disclaimer')) {
        expect(resolves(link.href), link.href).toBe(true)
      }
      expect(link.href, link.text).toMatch(/^(\/|https:\/\/)/)
    }
  })

  it('dates the court ruling note and cites the AMA', () => {
    const court = aboutPage.sections.find((s) => s.id === 'court-rulings')
    const text = JSON.stringify(court)
    expect(text).toContain('As of November 3, 2026')
    expect(text).toContain('Massachusetts v. Oz')
    const cpt = JSON.stringify(aboutPage.sections.find((s) => s.id === 'cpt'))
    expect(cpt).toContain('registered trademark of the American Medical Association')
  })

  it('says the site is not legal advice and holds no patient data', () => {
    const disclaimer = JSON.stringify(infoPages.find((p) => p.path === '/disclaimer'))
    expect(disclaimer).toContain('not legal advice')
    expect(JSON.stringify(aboutPage)).toContain('no patient data')
    const privacy = JSON.stringify(infoPages.find((p) => p.path === '/privacy'))
    expect(privacy).toContain('cookies')
  })

  it('never puts an email address in a public page', () => {
    for (const page of infoPages) expect(JSON.stringify(page)).not.toMatch(/mailto:|@[a-z]+\./i)
  })
})

describe('footer and report links', () => {
  it('links the four pages, the source code and the data-error issue form', () => {
    expect(footerLinks.map((l) => l.text)).toEqual([
      'About and methodology',
      'Disclaimer',
      'Privacy',
      'Accessibility',
      'Source code',
      'Report a problem',
    ])
    expect(SOURCE_CODE_URL).toBe('https://github.com/buddingmonkey/medical-frailty-dashboard')
    expect(REPORT_PROBLEM_URL).toBe(`${SOURCE_CODE_URL}/issues/new?template=data-error.yml`)
    for (const link of footerLinks.filter((l) => l.href.startsWith('/'))) {
      expect(resolves(link.href), link.href).toBe(true)
    }
  })

  it('asks for a missing state list in words that name the state', () => {
    expect(reportListText('Ohio')).toContain('Ohio')
  })

  it('takes the newest published update across states', () => {
    expect(
      dataLastUpdated([
        { published: null },
        { published: { updatedAt: '2026-10-01T10:00:00Z' } },
        { published: { updatedAt: null } },
        { published: { updatedAt: '2026-11-02T08:00:00Z' } },
      ]),
    ).toBe('2026-11-02T08:00:00Z')
    expect(dataLastUpdated([{ published: null }])).toBeNull()
    expect(dataUpdatedText('2026-11-02T08:00:00Z')).toBe('Data last updated November 2, 2026')
  })
})
