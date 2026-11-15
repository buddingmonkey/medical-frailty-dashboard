import { OVERLAPS_DESCRIPTION, OVERLAPS_INTRO, overlapsPageTitle } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedOverview } from '../test/overview-fixtures'

// /compare/overlaps, server-rendered (project lead, 2026-11-12; docs/seo.md): the Overlaps
// tab's table with scripts off, treated like /compare/map (indexed, canonical to the bare page,
// in the sitemap). Fixture: src/test/overview-fixtures.ts (as in routes/public/overlaps.test.ts).

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
    host: host ?? `overlaps-page-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets },
  })
}

/** The text inside <div id="app">, whitespace collapsed. */
async function appHtml(path: string): Promise<string> {
  const html = await (await get(path)).text()
  const start = html.indexOf('<div id="app">')
  return html.slice(start, html.lastIndexOf('</div>')).replace(/\s+/g, ' ')
}

beforeEach(async () => {
  await seedOverview()
})

describe('GET /compare/overlaps (server-rendered, indexed)', () => {
  it('has its own title, description and canonical, and is indexed like the map', async () => {
    const res = await get('/compare/overlaps?category=equipment', 'frailty.example.org')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    const html = await res.text()
    expect(html).toContain(`<title>${overlapsPageTitle}</title>`)
    expect(html).toContain(`<meta name="description" content="${OVERLAPS_DESCRIPTION}"`)
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/overlaps" />',
    )
    expect(html).not.toContain('noindex')
  })

  it('carries the tabs, the picker as a GET form, and the first category by default', async () => {
    const app = await appHtml('/compare/overlaps')
    expect(app).toContain('<h1>Which states list the same codes</h1>')
    expect(app).toContain('<a href="/compare/overlaps" aria-current="page">Overlaps</a>')
    expect(app).toContain(OVERLAPS_INTRO)
    expect(app).toContain('<form method="get" action="/compare/overlaps">')
    expect(app).toContain('<option value="serious-mental-illness" selected>')
    expect(app).toContain(
      '<caption> Serious mental illness: groups of states that list exactly the same codes </caption>',
    )
  })

  it('renders one row per intersection in words, with its codes as links', async () => {
    const app = await appHtml('/compare/overlaps?category=serious-mental-illness')
    expect(app).toContain(
      '<th scope="row">3 codes listed by all 2 states that list codes in this category</th> <td>3</td>',
    )
    expect(app).toContain('<th scope="row">2 codes listed only by Montana</th> <td>2</td>')
    expect(app).toContain('<a href="/codes/icd-10-cm/F20.0">F20.0</a>')
    expect(app).toContain('<li>F20.0–F20.9</li>')
    // Each state's set size, by name.
    expect(app).toMatch(/<th scope="row"><a href="\/states\/mt">Montana<\/a><\/th> <td>5<\/td>/)
    expect(app).toMatch(/<th scope="row"><a href="\/states\/ga">Georgia<\/a><\/th> <td>3<\/td>/)
  })

  it('says so for a category no state lists, and falls back for an unknown one', async () => {
    expect(await appHtml('/compare/overlaps?category=kidney-failure')).toContain(
      'No state includes any code in this category yet.',
    )
    expect(await appHtml('/compare/overlaps?category=nope')).toContain(
      '<option value="serious-mental-illness" selected>',
    )
  })

  it('is in the sitemap next to the map', async () => {
    const xml = await (await get('/sitemaps/pages.xml', 'frailty.example.org')).text()
    expect(xml).toContain('<loc>http://frailty.example.org/compare/overlaps</loc>')
  })
})
