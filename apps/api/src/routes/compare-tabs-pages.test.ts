import {
  CATEGORIES_DESCRIPTION,
  CATEGORIES_INTRO,
  MAP_DESCRIPTION,
  pageTitles,
  STATES_LANDING_INTRO,
  TILE_MAP_INTRO,
} from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'

// The compare tabs, server-rendered (project lead, 2026-11-02; docs/seo.md): the same tab row
// as the Vue pages on every /compare page, and the three pages new with them: Categories, Map
// and States side by side. Fixture: src/test/overview-fixtures.ts (`seedStatesCompare`; GA, MT
// and NE have a list, LA does not; three published categories and a draft).

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
    host: host ?? `tabs-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets },
  })
}

/** The text inside <div id="app">. */
function appHtml(html: string): string {
  const start = html.indexOf('<div id="app">')
  return html.slice(start, html.lastIndexOf('</div>'))
}

/** The compare tabs' <nav>, whitespace collapsed. */
function tabsHtml(html: string): string {
  const start = html.indexOf('<nav aria-label="Compare views">')
  if (start === -1) return ''
  return html.slice(start, html.indexOf('</nav>', start) + 6).replace(/\s+/g, ' ')
}

const tabs = [
  ['Overview', '/compare'],
  ['Categories', '/compare/categories'],
  ['Map', '/compare/map'],
  ['States side by side', '/compare/states'],
  ['Single codes', '/compare/codes'],
] as const

beforeEach(async () => {
  await seedStatesCompare()
})

describe('compare tabs in the server-rendered HTML', () => {
  it('every compare page carries the same tabs under its heading, the current one marked', async () => {
    for (const [path, current, mark] of [
      ['/compare', 'Overview', 'page'],
      ['/compare/categories', 'Categories', 'page'],
      ['/compare/map', 'Map', 'page'],
      ['/compare/states', 'States side by side', 'page'],
      ['/compare/codes', 'Single codes', 'page'],
      ['/compare/serious-mental-illness', 'Categories', 'true'],
      ['/compare/states/ga-vs-mt', 'States side by side', 'true'],
      ['/compare/no-such-category', 'Categories', 'true'],
      ['/compare/states/ga-vs-zz', 'States side by side', 'true'],
    ] as const) {
      const app = appHtml(await (await get(path)).text())
      const nav = tabsHtml(app)
      expect(nav, path).not.toBe('')
      for (const [label, href] of tabs) {
        const attr = label === current ? ` aria-current="${mark}"` : ''
        expect(nav, `${path} ${label}`).toContain(`<a href="${href}"${attr}>${label}</a>`)
      }
      // Under the page heading.
      expect(app.indexOf('</h1>'), path).toBeLessThan(app.indexOf('aria-label="Compare views"'))
      expect(app, path).not.toContain('Overview of every state')
    }
  })

  it('leaves the tabs off pages outside /compare', async () => {
    for (const path of ['/', '/states', '/states/ga']) {
      expect(tabsHtml(await (await get(path)).text()), path).toBe('')
    }
  })

  it('the overview drops its link to the code table and links each column to its page', async () => {
    const app = appHtml(await (await get('/compare')).text())
    expect(app).not.toContain('To compare single codes')
    expect(app).toMatch(
      /<th scope="col">\s*<a href="\/compare\/serious-mental-illness">Serious mental illness<\/a>\s*<\/th>/,
    )
    expect(app).toMatch(/<a href="\/compare\/equipment">Equipment †<\/a>/)
  })
})

describe('GET /compare/categories (server-rendered, indexed)', () => {
  it('has its own title, description and canonical, and is indexed', async () => {
    const res = await get('/compare/categories', 'frailty.example.org')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.categories}</title>`)
    expect(html).toContain(`<meta name="description" content="${CATEGORIES_DESCRIPTION}"`)
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/categories" />',
    )
    expect(html).not.toContain('noindex')
  })

  it('lists every published category under its federal category, with its definition', async () => {
    const app = appHtml(await (await get('/compare/categories')).text())
    expect(app).toContain('<h1>Categories we compare states by</h1>')
    expect(app).toContain(CATEGORIES_INTRO)
    const flat = app.replace(/\s+/g, ' ')
    expect(flat).toContain(
      '<h2>Disabling mental disorder</h2> <ul> <li> <a href="/compare/serious-mental-illness">Serious mental illness</a> <p>Test category.</p> </li> </ul>',
    )
    expect(flat).toContain('<a href="/compare/equipment">Equipment</a>')
    expect(flat).toContain('<a href="/compare/kidney-failure">Kidney failure</a>')
    expect(app.indexOf('Physical, intellectual')).toBeLessThan(app.indexOf('Serious or complex'))
    expect(app).not.toContain('Draft psychoses')
  })
})

describe('GET /compare/map (server-rendered, indexed)', () => {
  it('renders the tile map as a table with a picker that stays on the page', async () => {
    const res = await get('/compare/map', 'frailty.example.org')
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.map}</title>`)
    expect(html).toContain(`<meta name="description" content="${MAP_DESCRIPTION}"`)
    expect(html).toContain('<link rel="canonical" href="http://frailty.example.org/compare/map" />')
    expect(html).not.toContain('noindex')
    const app = appHtml(html)
    expect(app).toContain('<h1>One category across the country</h1>')
    expect(app).toContain(TILE_MAP_INTRO)
    expect(app).toContain('<form method="get" action="/compare/map">')
    expect(app).toMatch(
      /<caption>\s*Serious mental illness: share of the category’s codes that each state lists\s*<\/caption>/,
    )

    const kidney = appHtml(await (await get('/compare/map?category=kidney-failure')).text())
    expect(kidney).toContain('<option value="kidney-failure" selected>Kidney failure</option>')
  })

  it('the home page keeps its tile map, with its own form', async () => {
    const app = appHtml(await (await get('/')).text())
    expect(app).toContain('<h2>One category across the country</h2>')
    expect(app).toContain('<form method="get" action="/">')
  })
})

describe('GET /compare/states (server-rendered landing, noindex)', () => {
  it('offers both pickers as GET forms, never indexed', async () => {
    const res = await get('/compare/states', 'frailty.example.org')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.statesLanding}</title>`)
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/states" />',
    )
    expect(html).toContain('<meta name="robots" content="noindex" />')
    const app = appHtml(html)
    expect(app).toContain('<h1>States side by side</h1>')
    expect(app).toContain(STATES_LANDING_INTRO)
    // Your state: only states with a list.
    expect(app).toMatch(
      /<form method="get" action="\/compare\/states">\s*<p>\s*<label for="own-state">Your state<\/label>/,
    )
    const own = app.slice(
      app.indexOf('id="own-state"'),
      app.indexOf('</select>', app.indexOf('id="own-state"')),
    )
    expect([...own.matchAll(/<option value="([a-z]*)"/g)].map((m) => m[1])).toEqual([
      '',
      'ga',
      'mt',
      'ne',
    ])
    // Choose 2 to 4: the comparison's picker form.
    expect(app).toContain('<legend>States to compare</legend>')
    expect(app).toContain('<label for="states-picker-0">First state</label>')
    expect(app).not.toContain('most similar lists')
  })

  it('?state= shows that state’s most similar states, as on its page', async () => {
    const app = appHtml(await (await get('/compare/states?state=ga')).text())
    expect(app).toContain('<option value="ga" selected>Georgia</option>')
    expect(app).toContain('<h2>States with the most similar lists</h2>')
    expect(app).toContain('<input type="hidden" name="states" value="ga" />')
    expect(app).toContain('<a href="/compare/states/ga-vs-mt">Compare with Montana</a>')

    // A state without a list, or none at all, shows the landing alone.
    for (const path of ['/compare/states?state=la', '/compare/states?state=zz']) {
      const res = await get(path)
      expect(res.status, path).toBe(200)
      expect(appHtml(await res.text()), path).not.toContain('most similar lists')
    }
  })

  it('the pickers still redirect to the comparison, or say what was wrong', async () => {
    const res = await get('/compare/states?states=ga&states=mt')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/compare/states/ga-vs-mt')
    const one = await get('/compare/states?states=ga')
    expect(one.status).toBe(404)
    expect(await one.text()).toContain('Choose 2 to 4 different states')
  })
})

describe('sitemap', () => {
  it('lists the Categories and Map pages, not the states landing', async () => {
    const xml = await (await get('/sitemap.xml', 'frailty.example.org')).text()
    expect(xml).toContain('<loc>http://frailty.example.org/compare/categories</loc>')
    expect(xml).toContain('<loc>http://frailty.example.org/compare/map</loc>')
    expect(xml).not.toContain('/compare/states')
  })
})
