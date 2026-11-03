import {
  AMA_NOTICE_SHORT,
  footerLinks,
  infoPages,
  learnMore,
  REPORT_PROBLEM_URL,
} from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedPublicStates } from '../test/public-fixtures'

// About/methodology, disclaimer, privacy and accessibility (roadmap M8 step 4), the footer links
// and "Data last updated" on every server-rendered page, and the "learn more" links.

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Compare the code lists." />
    <title>Medical Frailty Coding Dashboard</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`

const assets: Fetcher = {
  fetch: () =>
    Promise.resolve(
      new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    ),
  connect: () => {
    throw new Error('not used in tests')
  },
}

let calls = 0
function get(path: string, host?: string) {
  calls += 1
  return call(path, {
    host: host ?? `info-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets },
  })
}

/** The footer of a page's HTML. */
function footerOf(html: string): string {
  return html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
}

const amp = (url: string) => url.replaceAll('&', '&amp;')

beforeEach(async () => {
  await seedPublicStates()
})

describe('info pages (server-rendered)', () => {
  for (const page of infoPages) {
    it(`${page.path}: title, description, canonical, sections, indexed`, async () => {
      const res = await get(page.path, 'frailty.example.org')

      expect(res.status).toBe(200)
      expect(res.headers.get('x-robots-tag')).toBeNull()
      const html = await res.text()
      expect(html).toContain(`<title>${page.title.replaceAll('&', '&amp;')}</title>`)
      expect(html).toContain(`<link rel="canonical" href="http://frailty.example.org${page.path}"`)
      expect(html).not.toContain('<meta name="robots" content="noindex"')
      expect(html).toContain(`<h1>${page.heading}</h1>`)
      for (const section of page.sections) {
        expect(html, section.id).toContain(`id="${section.id}"`)
      }
    })
  }

  it('About carries the court note, the AMA notice and the report link', async () => {
    const html = await (await get('/about')).text()
    expect(html).toContain('Massachusetts v. Oz')
    expect(html).toContain('As of November 3, 2026')
    expect(html).toContain('registered trademark of the American Medical Association')
    expect(html).toContain(`href="${amp(REPORT_PROBLEM_URL)}"`)
  })
})

describe('footer on every server-rendered page', () => {
  it('links the info pages, the source code and the issue form, with the data date', async () => {
    for (const path of ['/', '/states/ga', '/compare', '/about', '/privacy', '/search']) {
      const footer = footerOf(await (await get(path)).text())
      for (const link of footerLinks) {
        expect(footer, `${path} ${link.text}`).toContain(`href="${amp(link.href)}"`)
        expect(footer, `${path} ${link.text}`).toContain(`>${link.text}</a>`)
      }
      expect(footer, path).toContain('Data last updated November 2, 2026')
      expect(footer, path).toContain(AMA_NOTICE_SHORT)
    }
  })
})

describe('the pages sitemap', () => {
  it('lists the four info pages', async () => {
    const xml = await (await get('/sitemaps/pages.xml', 'frailty.example.org')).text()
    for (const page of infoPages) {
      expect(xml).toContain(`<loc>http://frailty.example.org${page.path}</loc>`)
    }
  })
})

describe('learn-more links in the server-rendered HTML', () => {
  it('each place links to its section of About', async () => {
    for (const [path, link] of [
      ['/', learnMore.home],
      ['/compare', learnMore.overview],
      ['/compare/categories', learnMore.categories],
      ['/states/ga', learnMore.stateCategories],
      ['/states/ga', learnMore.similarity],
      ['/states/ga', learnMore.downloads],
      ['/compare/codes?states=ga,ne&category=sud', learnMore.badges],
    ] as const) {
      const html = await (await get(path)).text()
      expect(html, `${path} ${link.href}`).toContain(`<a href="${link.href}">${link.text}</a>`)
    }
  })

  it('a state without a list asks for one, linking the issue form', async () => {
    const html = await (await get('/states/mt')).text()
    const main = html.slice(0, html.indexOf('<footer'))
    expect(main).toContain('Know of a published medical frailty code list for Montana?')
    expect(main).toContain(`href="${amp(REPORT_PROBLEM_URL)}"`)
  })
})
