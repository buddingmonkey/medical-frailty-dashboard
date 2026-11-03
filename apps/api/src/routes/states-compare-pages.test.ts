import { pageTitles } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'

// Compare 2–4 states and "states like mine", server-rendered (roadmap M5 step 7; docs/seo.md):
// the comparison page, its CSV, the pickers' redirect for browsers without JavaScript, and the
// similar-states section of a state page. Fixture: src/test/overview-fixtures.ts
// (`seedStatesCompare`; GA, MT and NE have a list, LA does not).

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
    host: host ?? `scp-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets },
  })
}

/** The text inside <div id="app">. */
function appHtml(html: string): string {
  const start = html.indexOf('<div id="app">')
  return html.slice(start, html.lastIndexOf('</div>'))
}

beforeEach(async () => {
  await seedStatesCompare()
})

describe('GET /compare/states/:pair (server-rendered)', () => {
  it('title, canonical to the sorted pair, never indexed', async () => {
    const res = await get('/compare/states/mt-vs-ga', 'frailty.example.org')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`<title>${pageTitles.statesCompare('Montana vs Georgia')}</title>`)
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/compare/states/ga-vs-mt" />',
    )
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toMatch(/<meta name="description" content="Where Montana and Georgia[^"]*differ/)
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('renders the summary and only the differences as a real table, in column order', async () => {
    const app = appHtml(await (await get('/compare/states/ga-vs-mt')).text())
    expect(app).toContain('<h1>Georgia vs Montana</h1>')
    expect(app).toMatch(/<dt>Only Georgia includes<\/dt>\s*<dd>1<\/dd>/)
    expect(app).toMatch(/<dt>Only Montana includes<\/dt>\s*<dd>2<\/dd>/)
    expect(app).toMatch(/<dt>Both include<\/dt>\s*<dd>4<\/dd>/)
    expect(app).toMatch(/<dt>Similarity \(0–1\)<\/dt>\s*<dd>0\.44<\/dd>/)
    expect(app).toMatch(/<caption>\s*Codes where Georgia and Montana differ\s*<\/caption>/)
    expect(app).toMatch(/<th scope="col">Georgia<\/th>\s*<th scope="col">Montana<\/th>/)
    expect(app).toMatch(
      /<th scope="rowgroup" colspan="2"><a href="\/compare\/serious-mental-illness">Serious mental illness<\/a>[^<]*<\/th>\s*<td>3 codes<\/td>\s*<td>5 codes<\/td>/,
    )
    expect(app).toMatch(
      /<th scope="row">F31\.\*<\/th>\s*<td>Code F31<\/td>\s*<td>Listed; Needs another code[^<]*<\/td>\s*<td>Covered by F31\.\*–F32\.\*; Enough by itself/,
    )
    expect(app).not.toMatch(/<th scope="row">F20\.0<\/th>/)
    // Links: show every code, the CSV, the pickers' form.
    expect(app).toContain('href="?diff=0"')
    expect(app).toContain('href="/compare/states/ga-vs-mt/codes.csv"')
    expect(app).toMatch(/<form method="get" action="\/compare\/states">/)
    expect(app).toMatch(/<option value="ga" selected>Georgia<\/option>/)
  })

  it('diff=0 shows every code and marks the ones that differ', async () => {
    const app = appHtml(await (await get('/compare/states/ga-vs-mt?diff=0')).text())
    expect(app).toMatch(/<caption>\s*Every code of Georgia and Montana/)
    expect(app).toMatch(/<th scope="row">F20\.0<\/th>/)
    expect(app).toMatch(/<th scope="row">F31\.\* \(differs\)<\/th>/)
    expect(app).toContain('href="?"')
  })

  it('three states put codes in no unified category last', async () => {
    const app = appHtml(await (await get('/compare/states/ga-vs-mt-vs-ne')).text())
    expect(app).toContain('<h1>Georgia vs Montana vs Nebraska</h1>')
    expect(app).toMatch(/<dt>All 3 include<\/dt>\s*<dd>1<\/dd>/)
    expect(app).not.toContain('<dt>Similarity (0–1)</dt>')
    expect(app.indexOf('Kidney failure')).toBeLessThan(
      app.indexOf('Not in any comparison category'),
    )
    expect(app).toMatch(/<th scope="row">Z99\.2<\/th>/)
  })

  it('says when a state has no list', async () => {
    const res = await get('/compare/states/ga-vs-la')
    expect(res.status).toBe(200)
    const app = appHtml(await res.text())
    expect(app).toContain('Louisiana has no list on this site yet, so there is nothing to compare.')
    expect(app).not.toContain('<table')
  })

  it('answers 404 for an unknown state, one state, five, or repeats', async () => {
    for (const path of [
      '/compare/states/ga-vs-zz',
      '/compare/states/ga',
      '/compare/states/ga-vs-ga',
      '/compare/states/ga-vs-mt-vs-ne-vs-la-vs-tx',
    ]) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
      const html = await res.text()
      expect(html).toContain('noindex')
      expect(html).toContain('<h1>Comparison not found</h1>')
    }
  })

  it('redirects capitals to the lowercase address', async () => {
    const res = await get('/compare/states/GA-vs-MT?diff=0')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/compare/states/ga-vs-mt?diff=0')
  })

  it('the pickers’ form (no JavaScript) redirects to the comparison', async () => {
    const res = await get('/compare/states?states=ga&states=&states=mt&states=ga')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/compare/states/ga-vs-mt')
    const one = await get('/compare/states?states=ga')
    expect(one.status).toBe(404)
    expect(await one.text()).toContain('Choose 2 to 4 different states')
  })

  it('CSV: every code, differing or not, with each state’s cell', async () => {
    const res = await get('/compare/states/ga-vs-mt/codes.csv')
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="compare-ga-vs-mt-medical-frailty-codes.csv"',
    )
    const lines = (await res.text()).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'code_system,code,description,description_source,unified_categories,differs,' +
        'GA_status,GA_entry,GA_tier,GA_qualification,GA_state_category,' +
        'MT_status,MT_entry,MT_tier,MT_qualification,MT_state_category',
    )
    expect(lines).toHaveLength(8)
    expect(lines).toContain(
      'ICD-10-CM,F31.*,Code F31,CMS,Serious mental illness,yes,Listed,F31.*,,Needs another code or documentation,Behavioral Health,Covered by F31.*–F32.*,F31.*–F32.*,,Enough by itself,SMI',
    )
    expect(lines).toContain(
      'ICD-10-CM,F20.0,Code F200,CMS,Serious mental illness,no,Listed,F20.0,,Enough by itself,Behavioral Health,Covered by F20.0–F20.9,F20.0–F20.9,,Enough by itself,SMI',
    )
    expect((await get('/compare/states/ga-vs-zz/codes.csv')).status).toBe(404)
    expect((await get('/compare/states/ga-vs-la/codes.csv')).status).toBe(404)
  })

  it('is not in the sitemap', async () => {
    const xml = await (await get('/sitemap.xml')).text()
    expect(xml).not.toContain('/compare/states')
  })
})

describe('GET /states/:slug: states like mine (server-rendered)', () => {
  it('lists the most similar states with links and a form to compare several', async () => {
    const app = appHtml(await (await get('/states/ga')).text())
    expect(app).toContain('<h2>States with the most similar lists</h2>')
    expect(app).toMatch(
      /<label for="similar-mt">Montana<\/label>\s*Similarity 0\.44[\s\S]*?<a href="\/compare\/states\/ga-vs-mt">Compare with Montana<\/a>/,
    )
    expect(app).toMatch(/Nebraska[\s\S]*?Similarity 0\.14/)
    expect(app.indexOf('Montana')).toBeLessThan(app.indexOf('Nebraska'))
    expect(app).toMatch(/<form method="get" action="\/compare\/states">/)
    expect(app).toContain('<input type="hidden" name="states" value="ga" />')
    expect(app).toMatch(/<input type="checkbox" name="states" value="mt" id="similar-mt" \/>/)
    expect(app).toContain('<button type="submit">Compare Georgia with the chosen states</button>')
  })

  it('leaves the section out for a state without a list', async () => {
    const app = appHtml(await (await get('/states/la')).text())
    expect(app).not.toContain('most similar lists')
  })
})
