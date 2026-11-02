import { pageTitles } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../db/client'
import { sourceDocuments, states } from '../db/schema'
import { call } from '../test/access-fixtures'
import { seedPublicStates } from '../test/public-fixtures'

// Server-rendered public pages, downloads and the sitemap (roadmap M3 step 4; docs/seo.md).

const db = createDb(env.DB)

/** The shape of the built index.html (apps/web/index.html after `vite build`). */
const indexHtml = (build = 'abc') => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Compare the code lists." />
    <title>Medical Frailty Coding Dashboard</title>
    <script src="/theme-init.js"></script>
    <script type="module" crossorigin src="/assets/index-${build}.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`

function assets(build = 'abc'): Fetcher {
  return {
    fetch: () =>
      Promise.resolve(
        new Response(indexHtml(build), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      ),
    connect: () => {
      throw new Error('not used in tests')
    },
  }
}

let calls = 0

/** Public mode; a new host per call (cache key) unless one is given. */
function get(path: string, options: { host?: string; build?: string } = {}) {
  calls += 1
  return call(path, {
    host: options.host ?? `pages-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets(options.build) },
  })
}

/** The JSON-LD objects in a page. */
function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const open = '<script type="application/ld+json">'
  let at = html.indexOf(open)
  while (at !== -1) {
    const end = html.indexOf('</script>', at)
    out.push(JSON.parse(html.slice(at + open.length, end)) as Record<string, unknown>)
    at = html.indexOf(open, end)
  }
  return out
}

/** The text inside <div id="app">. */
function appHtml(html: string): string {
  const start = html.indexOf('<div id="app">')
  return html.slice(start, html.lastIndexOf('</div>'))
}

beforeEach(async () => {
  await seedPublicStates()
  await db
    .update(sourceDocuments)
    .set({ url: 'https://medicaid.georgia.gov/list.pdf' })
    .where(eq(sourceDocuments.title, 'GA list published'))
})

describe('GET /states/:slug (server-rendered)', () => {
  it('fills in the title, description, canonical, Open Graph, JSON-LD and the facts', async () => {
    const res = await get('/states/ga', { host: 'frailty.example.org' })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.state('Georgia')}</title>`)
    expect(html).toContain('<link rel="canonical" href="http://frailty.example.org/states/ga"')
    expect(html).toContain('<meta property="og:url" content="http://frailty.example.org/states/ga"')
    expect(html).toMatch(/<meta name="description" content="[^"]*Georgia[^"]*4 entries/)
    // The Vue app still loads.
    expect(html).toContain('/assets/index-abc.js')

    const app = appHtml(html)
    expect(app).toContain('<h1>Georgia</h1>')
    expect(app).toContain('Georgia’s medical frailty code list on this site has 4 entries')
    expect(app).toContain('dated September 15, 2026')
    expect(app).toContain('Mental health')
    expect(app).toContain('href="https://medicaid.georgia.gov/list.pdf"')
    expect(app).toContain('href="/states/ga/codes.csv"')

    const [dataset] = jsonLd(html)
    expect(dataset).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Georgia medical frailty codes',
      url: 'http://frailty.example.org/states/ga',
      isBasedOn: ['https://medicaid.georgia.gov/list.pdf'],
      dateModified: '2026-11-02T10:00:00.000Z',
      spatialCoverage: { '@type': 'State', name: 'Georgia' },
    })
    expect(dataset?.['distribution']).toEqual([
      expect.objectContaining({
        encodingFormat: 'text/csv',
        contentUrl: 'http://frailty.example.org/states/ga/codes.csv',
      }),
      expect.objectContaining({
        encodingFormat: 'application/json',
        contentUrl: 'http://frailty.example.org/states/ga/codes.json',
      }),
    ])
  })

  it('escapes everything that came from the database', async () => {
    await db
      .update(states)
      .set({ notesMd: '<img src=x onerror=alert(1)>' })
      .where(eq(states.id, 'GA'))
    await db
      .update(sourceDocuments)
      .set({ title: 'List </script><script>alert(1)</script>' })
      .where(eq(sourceDocuments.title, 'GA list published'))

    const html = await (await get('/states/ga')).text()

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<script>alert(1)')
    expect(jsonLd(html)).toHaveLength(1)
  })

  it('says when a state has no list yet', async () => {
    const res = await get('/states/mt')

    expect(res.status).toBe(200)
    const app = appHtml(await res.text())
    expect(app).toContain('Montana has announced a list of medical frailty codes')
  })

  it('redirects upper case to the lowercase address', async () => {
    const res = await get('/states/GA')

    expect(res.status).toBe(301)
    expect(new URL(res.headers.get('location') ?? '', 'http://x').pathname).toBe('/states/ga')
  })

  it('answers 404 with noindex for an unknown state', async () => {
    const res = await get('/states/zz')

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const html = await res.text()
    expect(html).toContain('<meta name="robots" content="noindex"')
    expect(html).toContain(`<title>${pageTitles.notFound}</title>`)
    expect(appHtml(html)).toContain('State not found')
  })

  it('caches per data version and per web build', async () => {
    const host = 'build-test.example.com'
    const first = await get('/states/ga', { host, build: 'one' })
    expect(first.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(await first.text()).toContain('index-one.js')

    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'GA'))
    expect(await (await get('/states/ga', { host, build: 'one' })).text()).toContain(
      '<h1>Georgia</h1>',
    )
    // A deploy changes index.html, so the old page (and its old script names) is not served.
    const next = await (await get('/states/ga', { host, build: 'two' })).text()
    expect(next).toContain('index-two.js')
    expect(next).toContain('<h1>Renamed</h1>')
  })
})

describe('GET / (server-rendered)', () => {
  it('lists every state with its status and has WebSite JSON-LD', async () => {
    const html = await (await get('/', { host: 'frailty.example.org' })).text()

    expect(html).toContain(`<title>${pageTitles.home}</title>`)
    expect(html).toContain('<link rel="canonical" href="http://frailty.example.org/"')
    const app = appHtml(html)
    expect(app).toContain('<a href="/states/ga">Georgia</a>')
    expect(app).toContain('List on this site')
    expect(app).toContain('1 of 51 states and DC have a list on this site.')
    expect(jsonLd(html)[0]).toMatchObject({
      '@type': 'WebSite',
      url: 'http://frailty.example.org/',
    })
  })
})

describe('downloads', () => {
  it('CSV: every entry with its federal category and source citation', async () => {
    const res = await get('/states/ga/codes.csv')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="ga-medical-frailty-codes-v1.csv"',
    )
    const lines = (await res.text()).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'state,code_system,code,code_normalized,match_kind,range_end,includes_children,' +
        'description_published,state_category,state_subcategory,federal_category,tier,' +
        'qualification,qualification_basis,source_title,source_url,source_date,source_locator',
    )
    expect(lines).toHaveLength(5)
    const f10 = lines.find((l) => l.includes(',F10,'))
    expect(f10).toContain('ICD-10-CM')
    expect(f10).toContain('Substance use disorder')
    expect(f10).toContain('Needs another code')
    expect(f10).toContain('https://medicaid.georgia.gov/list.pdf,2026-09-15')
  })

  it('JSON: the citation once, then the entries', async () => {
    const res = await get('/states/ga/codes.json')

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="ga-medical-frailty-codes-v1.json"',
    )
    const body = await res.json<{
      state: string
      version: number
      sources: { url: string | null }[]
      entries: { code: string; federalCategory: string }[]
    }>()
    expect(body.state).toBe('GA')
    expect(body.version).toBe(1)
    expect(body.sources[0]?.url).toBe('https://medicaid.georgia.gov/list.pdf')
    expect(body.entries).toHaveLength(4)
    expect(body.entries.find((e) => e.code === 'F10')?.federalCategory).toBe('sud')
  })

  it('answers 404 for a state with no list', async () => {
    expect((await get('/states/mt/codes.csv')).status).toBe(404)
    expect((await get('/states/zz/codes.json')).status).toBe(404)
  })
})

describe('GET /sitemap.xml', () => {
  it('lists the home page and every state page with lastmod, on the request host', async () => {
    const res = await get('/sitemap.xml', { host: 'frailty.example.org' })

    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    const xml = await res.text()
    expect(xml).toContain('<loc>http://frailty.example.org/</loc>')
    expect(xml).toContain(
      '<url><loc>http://frailty.example.org/states/ga</loc><lastmod>2026-11-02</lastmod></url>',
    )
    expect(xml).toContain('<loc>http://frailty.example.org/states/mt</loc>')
  })
})
