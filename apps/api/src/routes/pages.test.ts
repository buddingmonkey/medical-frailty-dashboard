import {
  FEDERAL_OVERLAP_NOTE,
  FOOTER_TEXT,
  HOME_INTRO,
  OVERVIEW_DESCRIPTION,
  STATUTE_URL,
  pageTitles,
  stateCategoriesIntro,
  TILE_MAP_HEADING,
  TILE_MAP_HOME_LINK,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../db/client'
import { sourceDocuments, states } from '../db/schema'
import { call } from '../test/access-fixtures'
import { send } from '../test/draft-fixtures'
import { seedOverview } from '../test/overview-fixtures'
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
    expect(app).toContain('Montana has announced a medical frailty code list')
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
    expect(app).toContain('1 of the 50 states and DC have a list on this site.')
    // The plain-language pass (M6 step 3b): the intro, the law, and the Vue footer's words.
    expect(app).toContain(`<p>${HOME_INTRO}</p>`)
    expect(app).toContain(`<a href="${STATUTE_URL}" rel="noopener noreferrer external">`)
    expect(app).toMatch(/<footer>\s*<p>[^<]*No patient data\.<\/p>/)
    expect(app).toContain(FOOTER_TEXT)
    expect(jsonLd(html)[0]).toMatchObject({
      '@type': 'WebSite',
      url: 'http://frailty.example.org/',
    })
  })

  // The tile map moved to the Map tab (project lead, 2026-11-03); Home links to it.
  it('links to the Map tab and has no tile map, even with published categories', async () => {
    await seedOverview()
    const app = appHtml(await (await get('/')).text())
    expect(app).toContain(`<p><a href="/compare/map">${TILE_MAP_HOME_LINK}</a></p>`)
    expect(app).not.toContain(TILE_MAP_HEADING)
    expect(app).not.toContain('<form')
  })

  it('sends an old /?category= link to the Map tab with a 301, keeping the query', async () => {
    const res = await get('/?category=kidney-failure&x=1')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/compare/map?category=kidney-failure&x=1')

    expect((await get('/?x=1')).status).toBe(200)
  })
})

describe('GET /compare/map (server-rendered tile map)', () => {
  it('renders the tile map’s category as a table, with a picker that works without JavaScript', async () => {
    await seedOverview()
    const app = appHtml(await (await get('/compare/map')).text())

    // The picker: a GET form, categories under their federal parent, the default selected.
    expect(app).toContain('<form method="get" action="/compare/map">')
    expect(app).toMatch(
      /<optgroup label="Disabling mental disorder">\s*<option value="serious-mental-illness" selected>Serious mental illness<\/option>/,
    )
    expect(app).toContain('<option value="equipment">Equipment</option>')

    // The default is the first category by federal order: serious mental illness.
    expect(app).toMatch(
      /<caption>\s*Serious mental illness: share of the category’s diagnosis codes that each state’s list includes\s*<\/caption>/,
    )
    const table = app.slice(app.search(/<caption>\s*Serious mental illness:/))
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
      (m[1] ?? '').replace(/\s+/g, ' ').trim(),
    )
    // A header row, then every state and DC by name, also those not in the database.
    expect(rows).toHaveLength(52)
    expect(rows[1]).toContain('Alabama')
    expect(rows).toContain(
      '<th scope="row"><a href="/states/ga">Georgia</a></th> <td><a href="/compare/serious-mental-illness?focus=GA">50%</a> (not yet reviewed)</td>',
    )
    expect(rows).toContain(
      '<th scope="row"><a href="/states/mt">Montana</a></th> <td><a href="/compare/serious-mental-illness?focus=MT">100%</a></td>',
    )
    expect(rows).toContain(
      '<th scope="row"><a href="/states/la">Louisiana</a></th> <td>No list on this site yet</td>',
    )

    // A shared link's category; Georgia lists no kidney code.
    const kidney = appHtml(await (await get('/compare/map?category=kidney-failure')).text())
    expect(kidney).toContain('<option value="kidney-failure" selected>Kidney failure</option>')
    expect(kidney).toContain('<a href="/compare/kidney-failure?focus=GA">None listed</a>')
  })
})

describe('downloads', () => {
  it('CSV: every entry with its federal categories and source citation', async () => {
    const res = await get('/states/ga/codes.csv')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="ga-medical-frailty-codes-v1.csv"',
    )
    const lines = (await res.text()).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'state,code_system,code,code_normalized,match_kind,range_end,includes_children,' +
        'description_published,state_category,state_subcategory,federal_categories,tier,' +
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
      entries: { code: string; federalCategories: string[] }[]
    }>()
    expect(body.state).toBe('GA')
    expect(body.version).toBe(1)
    expect(body.sources[0]?.url).toBe('https://medicaid.georgia.gov/list.pdf')
    expect(body.entries).toHaveLength(4)
    expect(body.entries.find((e) => e.code === 'F10')?.federalCategories).toEqual(['sud'])
  })

  it('answers 404 for a state with no list', async () => {
    expect((await get('/states/mt/codes.csv')).status).toBe(404)
    expect((await get('/states/zz/codes.json')).status).toBe(404)
  })
})

describe('GET /sitemaps/pages.xml', () => {
  it('lists the home page and every state page with lastmod, on the request host', async () => {
    const res = await get('/sitemaps/pages.xml', { host: 'frailty.example.org' })

    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    const xml = await res.text()
    expect(xml).toContain('<loc>http://frailty.example.org/</loc>')
    expect(xml).toContain(
      '<url><loc>http://frailty.example.org/states/ga</loc><lastmod>2026-11-02</lastmod></url>',
    )
    expect(xml).toContain('<loc>http://frailty.example.org/states/mt</loc>')
    expect(xml).toContain('<loc>http://frailty.example.org/states</loc>')
    expect(xml).toContain(
      '<url><loc>http://frailty.example.org/compare</loc><lastmod>2026-11-02</lastmod></url>',
    )
  })
})

describe('GET /compare/codes (server-rendered, noindex)', () => {
  it('renders the table for the selection in the URL, never indexed', async () => {
    const res = await get('/compare/codes?states=ga,ne&category=sud')
    expect(res.status).toBe(200)
    const html = await res.text()

    expect(html).toContain(`<title>${pageTitles.compare}</title>`)
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/compare\/codes" \/>/)
    expect(html).toContain('<h1>Compare single codes</h1>')
    expect(html).toContain('<th scope="col"><a href="/states/ga">Georgia</a></th>')
    expect(html).toContain('<th scope="col"><a href="/states/ne">Nebraska</a></th>')
    // GA's F codes count as SUD by the chapter override; Nebraska has no list.
    expect(html).toMatch(/<th scope="row">F10\.\*<\/th>\s*<td>[^<]*<\/td>\s*<td>Listed/)
    expect(html).toContain('No list on this site')
    expect(html).toContain('2 codes, page 1 of 1')
    expect(html).toContain('href="/compare/codes.csv?states=GA%2CNE&amp;category=sud"')
  })

  it('without a selection, explains the page and still says noindex', async () => {
    const html = await (await get('/compare/codes')).text()
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toContain('Pick a category and at least one state')
    expect(html).not.toContain('<table')
  })

  it('says what was wrong with a bad selection', async () => {
    const html = await (await get('/compare/codes?states=ZZ&category=sud')).text()
    expect(html).toContain('No state has the code ZZ. Pick a category and states to compare.')
  })
})

describe('GET /compare/codes.csv', () => {
  it('every row, a column group per state', async () => {
    const res = await get('/compare/codes.csv?states=GA,NE&category=sud&page=2')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="compare-sud-ga-ne.csv"',
    )
    const lines = (await res.text()).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'code_system,code,description,description_source,' +
        'GA_status,GA_entry,GA_tier,GA_qualification,GA_qualification_basis,GA_state_category,GA_federal_categories,' +
        'NE_status,NE_entry,NE_tier,NE_qualification,NE_qualification_basis,NE_state_category,NE_federal_categories',
    )
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe(
      'ICD-10-CM,F10.*,,,Listed,F10.*,,Needs another code or documentation,Stated by the state,Mental health,Substance use disorder,No list on this site,,,,,,',
    )
  })

  it('answers 400 for a bad selection', async () => {
    const res = await get('/compare/codes.csv?states=GA')
    expect(res.status).toBe(400)
  })
})

describe('main navigation in the server-rendered HTML', () => {
  it('every page carries the same links, the current one marked', async () => {
    for (const [path, current] of [
      ['/', 'Home'],
      ['/states', 'States'],
      ['/states/ga', 'States'],
      ['/compare', 'Compare'],
      ['/compare/codes', 'Compare'],
    ] as const) {
      const html = await (await get(path)).text()
      expect(html, path).toContain('<nav aria-label="Main">')
      for (const [label, href] of [
        ['Home', '/'],
        ['States', '/states'],
        ['Compare', '/compare'],
        ['Search', '/search'],
      ] as const) {
        const mark =
          label !== current ? '' : path === href ? ' aria-current="page"' : ' aria-current="true"'
        expect(html, `${path} ${label}`).toContain(`<a href="${href}"${mark}>${label}</a>`)
      }
    }
  })
})

describe('GET /states (server-rendered)', () => {
  it('lists every state with a link to its page', async () => {
    const res = await get('/states')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<title>All states | Medical Frailty Coding Dashboard</title>')
    expect(html).toMatch(/<link rel="canonical" href="http:\/\/[^"]+\/states" \/>/)
    expect(html).toContain('<h1>All states</h1>')
    expect(html).toContain('<a href="/states/ga">Georgia</a>')
  })
})

describe('old /compare links to the code table', () => {
  it('answer 301 to /compare/codes with the same query', async () => {
    const res = await get('/compare?states=GA,NE&category=sud&page=2')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/compare/codes?states=GA,NE&category=sud&page=2')

    const csv = await get('/compare.csv?states=GA&category=sud')
    expect(csv.status).toBe(301)
    expect(csv.headers.get('location')).toBe('/compare/codes.csv?states=GA&category=sud')
  })
})

describe('GET /compare (server-rendered overview, indexed)', () => {
  beforeEach(async () => {
    await seedOverview()
  })

  it('has its own title, description and canonical, and is indexed', async () => {
    const res = await get('/compare', { host: 'frailty.example.org' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.overview}</title>`)
    expect(html).toContain(`<meta name="description" content="${OVERVIEW_DESCRIPTION}"`)
    expect(html).toContain('<link rel="canonical" href="http://frailty.example.org/compare" />')
    expect(html).not.toContain('noindex')
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('renders the whole matrix as a real table: federal groups, categories, numbers in words', async () => {
    const app = appHtml(await (await get('/compare')).text())
    expect(app).toContain('<h1>How much of each category each state lists</h1>')
    expect(app).toMatch(
      /<caption>\s*Share of each category’s diagnosis codes that each state’s list includes\s*<\/caption>/,
    )
    // Two header rows: the federal parents (in federal order), then the categories.
    expect(app).toContain('<th scope="col" rowspan="2">State</th>')
    expect(app).toContain('<th scope="colgroup" colspan="1">Disabling mental disorder</th>')
    expect(app).toContain(
      '<th scope="colgroup" colspan="1">Physical, intellectual or developmental disability</th>',
    )
    expect(app).toContain('<th scope="col" rowspan="2">Overall (average)</th>')
    expect(app.indexOf('Serious mental illness')).toBeLessThan(app.indexOf('Equipment'))
    expect(app.indexOf('Equipment')).toBeLessThan(app.indexOf('Kidney failure'))
    // A category without a full code list is marked.
    expect(app).toMatch(
      /<th scope="col">\s*<a href="\/compare\/equipment">Equipment †<\/a>\s*<\/th>/,
    )

    // Georgia: 3 of 6 SMI codes, placed by CCSR without review; all equipment; no kidney code.
    const georgia = app.slice(
      app.indexOf('<a href="/states/ga">'),
      app.indexOf('</tr>', app.indexOf('<a href="/states/ga">')),
    )
    const cells = [...georgia.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) =>
      (m[1] ?? '').replace(/\s+/g, ' ').trim(),
    )
    expect(cells).toEqual([
      '<a href="/compare/serious-mental-illness?focus=GA">50%</a> (not yet reviewed)',
      '<a href="/compare/equipment?focus=GA">100%</a>',
      '<a href="/compare/kidney-failure?focus=GA">0%</a>',
      '50%',
    ])
    // States without a list: one cell across the row.
    expect(app).toMatch(
      /<a href="\/states\/la">Louisiana<\/a><\/th>\s*<td colspan="4">\s*No list on this site yet\s*<\/td>/,
    )
    // Reading notes, the same words as the Vue page.
    expect(app).toContain('<h2>Reading this table</h2>')
    expect(app).toContain('no matter which of the state’s own categories')
    expect(app).toContain('href="/compare/codes"')
  })

  it('renders the order a shared link asks for, and marks the sorted column', async () => {
    const byName = appHtml(await (await get('/compare')).text())
    expect(byName.indexOf('/states/ga"')).toBeLessThan(byName.indexOf('/states/mt"'))
    expect(byName).not.toContain('aria-sort')

    // Montana lists all 6 serious mental illness codes, Georgia 3: highest first.
    const app = appHtml(await (await get('/compare?sort=serious-mental-illness')).text())
    expect(app.indexOf('/states/mt"')).toBeLessThan(app.indexOf('/states/ga"'))
    expect(app).toMatch(
      /<th scope="col" aria-sort="descending">\s*<a href="\/compare\/serious-mental-illness">Serious mental illness<\/a>\s*<\/th>/,
    )
    // States without a list stay last.
    expect(app.indexOf('/states/ga"')).toBeLessThan(app.indexOf('/states/la"'))

    const overall = appHtml(await (await get('/compare?order=overall&dir=asc')).text())
    expect(overall).toContain(
      '<th scope="col" rowspan="2" aria-sort="ascending">Overall (average)</th>',
    )
  })

  it('state page: says a code can count under more than one federal category', async () => {
    const before = appHtml(await (await get('/states/ga')).text())
    expect(before).toContain(stateCategoriesIntro('Georgia'))
    expect(before).not.toContain(FEDERAL_OVERLAP_NOTE)
    // F31.* also falls in a published category under another federal parent.
    const res = await send('POST', '/api/admin/unified', {
      label: 'Bipolar',
      definition: 'Test category.',
      includes: null,
      excludes: null,
      federalCategory: 'serious_complex_medical',
      status: 'published',
      sortOrder: 3,
      ccsr: ['TST002'],
    })
    expect(res.status).toBe(201)
    const after = appHtml(await (await get('/states/ga')).text())
    expect(after).toContain(`<p>${FEDERAL_OVERLAP_NOTE}</p>`)
    expect(after).toMatch(/<td>Serious or complex medical condition<\/td>\s*<td>1<\/td>/)
  })

  it('says so when there are no published categories yet', async () => {
    await seedPublicStates()
    const app = appHtml(await (await get('/compare')).text())
    expect(app).toContain('No categories are published yet.')
    expect(app).not.toContain('<table')
  })
})

describe('GET /compare/:slug (server-rendered drill-down)', () => {
  beforeEach(async () => {
    await seedOverview()
  })

  it('bare page: title, description from the definition, canonical, indexed', async () => {
    const res = await get('/compare/serious-mental-illness', { host: 'frailty.example.org' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.drillDown('Serious mental illness')}</title>`)
    expect(html).toContain('<meta name="description" content="Test category."')
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/serious-mental-illness" />',
    )
    expect(html).not.toContain('noindex')
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('renders the category, its CCSR citation and every group expanded as a table', async () => {
    const app = appHtml(await (await get('/compare/serious-mental-illness')).text())
    expect(app).toContain('<h1>Serious mental illness</h1>')
    expect(app).toContain('Disabling mental disorder')
    expect(app).toContain('TST001')
    expect(app).toContain('Agency for Healthcare Research and Quality')
    expect(app).toMatch(/<caption>\s*Serious mental illness: codes by how many states include them/)
    // Group rows, then code rows with counts and rules in words.
    expect(app).toMatch(
      /<th scope="rowgroup"[^>]*>F20<\/th>\s*<td>Code F20<\/td>\s*<td>2 of 2 include any<\/td>/,
    )
    expect(app).toMatch(
      /<th scope="row"><a href="\/codes\/icd-10-cm\/F20\.0">F20\.0<\/a><\/th>\s*<td>Code F200<\/td>\s*<td>2 of 2 states<\/td>\s*<td>Enough by itself: 2 states/,
    )
    expect(app.indexOf('>F20<')).toBeLessThan(app.indexOf('>F31<'))
    // Links: back to the overview, the code table for the federal parent, the CSV, details.
    expect(app).toContain('href="/compare"')
    expect(app).toContain(
      'href="/compare/codes?states=GA%2CMT&amp;category=disabling_mental_disorder"',
    )
    expect(app).toContain('href="/compare/serious-mental-illness/codes.csv"')
    expect(app).toContain('href="?code=icd10cm%7Cexact%7CF200#code-details"')
    // Without a universe: the note says why codes no state lists cannot be shown.
    const equipment = appHtml(await (await get('/compare/equipment')).text())
    expect(equipment).toContain(
      'This category has no reference list, so only codes some state includes are shown.',
    )
  })

  it('a query applies filters, focus and details, and is not indexed', async () => {
    const res = await get(
      '/compare/serious-mental-illness?show=one&focus=GA&code=icd10cm%7Cexact%7CF200',
      { host: 'frailty.example.org' },
    )
    const html = await res.text()
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/serious-mental-illness" />',
    )
    const app = appHtml(html)
    expect(app).not.toMatch(/<th scope="row">(<a [^>]*>)?F20\.0(<\/a>)?<\/th>/)
    expect(app).toMatch(/<th scope="row">F20\.0–F20\.9<\/th>[\s\S]*?1 narrower code listed/)
    expect(app).toContain('<th scope="col">Georgia</th>')
    // The details of F20.0.
    expect(app).toContain('id="code-details"')
    expect(app).toMatch(/Georgia<\/th>\s*<td>Listed/)
    expect(app).toMatch(/Montana<\/th>\s*<td>Covered by F20\.0–F20\.9/)
    expect(app).toMatch(/No list on this site \(2\): LA NE/)
  })

  it('answers 404 for a draft or unknown category', async () => {
    for (const path of ['/compare/draft-psychoses', '/compare/nothing-here']) {
      const res = await get(path)
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('noindex')
    }
  })

  it('CSV: every row of the view, a status column per state with a list', async () => {
    const res = await get('/compare/serious-mental-illness/codes.csv?all=1')
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="serious-mental-illness-codes-by-state.csv"',
    )
    const lines = (await res.text()).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'code_system,code,description,description_source,group,states_listing,states_with_list,GA,MT',
    )
    expect(lines).toHaveLength(11)
    expect(lines[1]).toBe('ICD-10-CM,F20.0,Code F200,CMS,F20,2,2,Listed,Covered by F20.0–F20.9')
    expect(lines).toContain('ICD-10-CM,F20.0–F20.9,,,F20,1,2,1 narrower code listed,Listed')
    const one = await get('/compare/serious-mental-illness/codes.csv?show=one')
    expect((await one.text()).trimEnd().split('\r\n')).toHaveLength(3)
    expect((await get('/compare/draft-psychoses/codes.csv')).status).toBe(404)
  })

  it('the sitemap lists every published category page', async () => {
    const xml = await (await get('/sitemaps/pages.xml', { host: 'frailty.example.org' })).text()
    expect(xml).toContain('<loc>http://frailty.example.org/compare/serious-mental-illness</loc>')
    expect(xml).toContain('<loc>http://frailty.example.org/compare/equipment</loc>')
    expect(xml).not.toContain('draft-psychoses')
  })
})
