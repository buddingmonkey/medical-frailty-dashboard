import { CODE_DETAIL_NOT_FOUND, SEARCH_PAGE } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../db/client'
import { publicCode } from '../db/public-code'
import {
  conditionGroups,
  conditionMembers,
  entries,
  refCodes,
  sourceDocuments,
  states,
} from '../db/schema'
import { call } from '../test/access-fixtures'
import { seedOverview } from '../test/overview-fixtures'

// Server-rendered code pages, /search and the code sitemap (roadmap M6 step 5; docs/seo.md).
// The fixture (src/test/overview-fixtures.ts): GA and MT have lists, LA is announced, NE has
// only a draft.
//   GA: F20.0 (alone), F31.* (needs another code), F32 header without children, E0601, E0602
//   MT: F20.0–F20.9 (same-length range), F31.*–F32.* (range of wildcards), E0601
// ref_codes: F20, F20.0, F20.1, F20.8 (deleted), F20.9, F31, F31.10, F31.20, F32, F32.0,
// F32.1, N18.6.

const db = createDb(env.DB)

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

/** Public mode; a new host per call (cache key) unless one is given. */
function get(path: string, host?: string) {
  calls += 1
  return call(path, {
    host: host ?? `codes-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ASSETS: assets },
  })
}

function jsonLd(html: string): Record<string, unknown>[] {
  const open = '<script type="application/ld+json">'
  const at = html.indexOf(open)
  if (at === -1) return []
  return [
    JSON.parse(html.slice(at + open.length, html.indexOf('</script>', at))) as Record<
      string,
      unknown
    >,
  ]
}

const appHtml = (html: string) =>
  html.slice(html.indexOf('<div id="app">'), html.lastIndexOf('</div>'))

/** Adds an entry to a state's published version, from its first source document. */
async function addEntry(stateId: string, row: Partial<typeof entries.$inferInsert>) {
  const [state] = await db.select().from(states).where(eq(states.id, stateId))
  const [doc] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.stateId, stateId))
  if (!state?.publishedVersionId || !doc) throw new Error('fixture')
  await db.insert(entries).values({
    codeSystem: 'cpt',
    rawCode: '',
    codeNorm: '',
    stateCategory: 'Services',
    ...row,
    versionId: state.publishedVersionId,
    sourceDocumentId: doc.id,
  })
}

beforeEach(async () => {
  await seedOverview()
  await db
    .update(sourceDocuments)
    .set({ url: 'https://medicaid.georgia.gov/list.pdf', publisherDate: '2026-09-15' })
    .where(eq(sourceDocuments.stateId, 'GA'))
})

describe('GET /codes/:system/:code (server-rendered)', () => {
  it('fills in the title, description, canonical and the plain-sentence answer', async () => {
    const res = await get('/codes/icd-10-cm/F20.0', 'frailty.example.org')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    const html = await res.text()
    expect(html).toContain(
      '<title>F20.0 Code F200: medical frailty status in 2 states | Medical Frailty Coding Dashboard</title>',
    )
    expect(html).toContain(
      '<link rel="canonical" href="http://frailty.example.org/codes/icd-10-cm/F20.0"',
    )
    expect(html).not.toContain('name="robots"')
    expect(html).toMatch(
      /<meta name="description" content="F20.0 \(Code F200\): 2 of 2 states with a list on this site include it in their medical frailty code lists \(Georgia and Montana\)/,
    )

    const app = appHtml(html)
    expect(app).toContain('<h1>F20.0 Code F200</h1>')
    expect(app).toContain('2 of 2 states with a list on this site include F20.0.')
    expect(app).toContain('Georgia’s list includes F20.0. State’s rule: Enough by itself.')
    expect(app).toContain(
      'Montana’s list includes F20.0 through its entry F20.0–F20.9. State’s rule: Enough by itself.',
    )
    expect(app).toContain('Last updated on this site November 2, 2026.')
    // Each fact with its source and date; the states without a list are named too.
    expect(app).toContain('<a href="https://medicaid.georgia.gov/list.pdf"')
    expect(app).toContain('September 15, 2026')
    expect(app).toContain('<a href="/states/la">Louisiana</a>')
    // The shared footer.
    expect(app).toContain('<footer>')
  })

  it('carries a DefinedTerm in its code set, on a page with dateModified', async () => {
    const html = await (await get('/codes/icd-10-cm/F20.0', 'frailty.example.org')).text()
    expect(jsonLd(html)[0]).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      url: 'http://frailty.example.org/codes/icd-10-cm/F20.0',
      dateModified: '2026-11-02T10:00:00.000Z',
      mainEntity: {
        '@type': 'DefinedTerm',
        termCode: 'F20.0',
        name: 'Code F200',
        url: 'http://frailty.example.org/codes/icd-10-cm/F20.0',
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          name: 'ICD-10-CM',
          url: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
        },
      },
    })
  })

  it('shows CPT only with the state’s own text, attributed, and escapes it', async () => {
    await addEntry('GA', {
      rawCode: '99213',
      codeNorm: '99213',
      descriptionPublished: 'Visit <script>alert(1)</script> & "more"',
      sourceLocator: 'p. 4',
    })
    const res = await get('/codes/cpt/99213')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<title>CPT 99213: medical frailty status in 2 states')
    const app = appHtml(html)
    expect(app).toContain('<h1>99213</h1>')
    expect(app).not.toContain('<script>alert')
    expect(app).toContain('Visit &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;more&quot;')
    expect(app).toContain('p. 4')
    expect(html).toContain('\\u003cscript\\u003e')
    const term = jsonLd(html)[0]?.['mainEntity']
    expect(term).toMatchObject({
      termCode: '99213',
      name: 'Visit <script>alert(1)</script> & "more"',
      disambiguatingDescription: 'As published by Georgia (GA list published)',
      inDefinedTermSet: { name: 'CPT' },
    })
  })

  it('gives a CPT code no name when no state published text for it', async () => {
    await addEntry('GA', { rawCode: '99213', codeNorm: '99213' })
    const html = await (await get('/codes/cpt/99213')).text()
    expect(jsonLd(html)[0]?.['mainEntity']).not.toHaveProperty('name')
  })

  it('answers 301 to the canonical address for other spellings', async () => {
    for (const path of [
      '/codes/icd-10-cm/f200',
      '/codes/icd-10-cm/F200',
      '/codes/icd-10-cm/f20.0',
      '/codes/ICD-10-CM/F20.0',
    ]) {
      const res = await get(path)
      expect(res.status, path).toBe(301)
      expect(res.headers.get('location'), path).toBe('/codes/icd-10-cm/F20.0')
    }
    const withQuery = await get('/codes/icd-10-cm/f200?x=1')
    expect(withQuery.headers.get('location')).toBe('/codes/icd-10-cm/F20.0?x=1')
  })

  it('answers 404 with noindex for an unknown or malformed code', async () => {
    for (const path of ['/codes/icd-10-cm/Z99.99', '/codes/nope/F20.0', '/codes/icd-10-cm/F20.*']) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex')
      const html = await res.text()
      expect(html).toContain('<meta name="robots" content="noindex" />')
      expect(html).toContain(`<h1>${CODE_DETAIL_NOT_FOUND.heading}</h1>`)
    }
  })

  it('keeps a code no published state includes out of the index', async () => {
    // N18.6 is in the CMS file only; F20 (a header) only has narrower codes listed.
    for (const path of ['/codes/icd-10-cm/N18.6', '/codes/icd-10-cm/F20']) {
      const res = await get(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex')
      expect(await res.text()).toContain('<meta name="robots" content="noindex" />')
    }
    const html = await (await get('/codes/icd-10-cm/F20')).text()
    expect(appHtml(html)).toContain(
      'Georgia’s list does not include F20 itself, but lists 1 more specific code under it.',
    )
  })

  it('shows like codes in their own section, apart from the included states', async () => {
    const [group] = await db
      .insert(conditionGroups)
      .values({ slug: 'test-kidney', name: 'Test kidney failure', status: 'published' })
      .returning()
    if (!group) throw new Error('fixture')
    await db.insert(conditionMembers).values([
      { groupId: group.id, codeSystem: 'icd10cm', matchKind: 'exact', codeNorm: 'N186' },
      { groupId: group.id, codeSystem: 'hcpcs', matchKind: 'exact', codeNorm: 'E0601' },
    ])
    const app = appHtml(await (await get('/codes/icd-10-cm/N18.6')).text())
    expect(app).toContain('<h2 id="like-codes-heading">Like codes</h2>')
    expect(app).toContain('This code is in the condition group Test kidney failure.')
    const like = app.slice(app.indexOf('like-codes-heading'))
    expect(like).toContain('<a href="/states/ga">Georgia</a>')
    expect(like).toContain('E0601')
    expect(app).toContain('0 of 2 states with a list on this site include N18.6.')
  })
})

describe('GET /search (server-rendered)', () => {
  it('says what the page is and is never indexed', async () => {
    const res = await get('/search?q=paranoid')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const html = await res.text()
    expect(html).toContain(`<title>${SEARCH_PAGE.title}</title>`)
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toMatch(/<link rel="canonical" href="http:\/\/[^"]+\/search" \/>/)
    expect(appHtml(html)).toContain(`<h1>${SEARCH_PAGE.heading}</h1>`)
  })
})

describe('links from the code tables', () => {
  it('links each single code in a category table to its page', async () => {
    const html = await (await get('/compare/serious-mental-illness')).text()
    expect(appHtml(html)).toContain('<a href="/codes/icd-10-cm/F20.0">F20.0</a>')
  })
})

describe('the sitemap', () => {
  it('is an index of the pages and the code pages', async () => {
    const res = await get('/sitemap.xml', 'frailty.example.org')
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    const xml = await res.text()
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>http://frailty.example.org/sitemaps/pages.xml</loc>')
    expect(xml).toContain(
      '<sitemap><loc>http://frailty.example.org/sitemaps/codes-1.xml</loc><lastmod>2026-11-02</lastmod></sitemap>',
    )
    expect(xml).not.toContain('codes-2.xml')
  })

  it('lists every code a published state includes, with lastmod, and nothing else', async () => {
    await addEntry('GA', { rawCode: '99213', codeNorm: '99213' })
    const xml = await (await get('/sitemaps/codes-1.xml', 'frailty.example.org')).text()
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain(
      '<url><loc>http://frailty.example.org/codes/icd-10-cm/F20.0</loc><lastmod>2026-11-02</lastmod></url>',
    )
    const locs = [...xml.matchAll(/<loc>http:\/\/frailty\.example\.org([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    )
    expect(locs).toEqual([
      '/codes/cpt/99213',
      '/codes/hcpcs/E0601',
      '/codes/hcpcs/E0602',
      // MT's F20.0–F20.9 covers every same-length code between, the deleted F20.8 too.
      '/codes/icd-10-cm/F20.0',
      '/codes/icd-10-cm/F20.1',
      '/codes/icd-10-cm/F20.8',
      '/codes/icd-10-cm/F20.9',
      '/codes/icd-10-cm/F31',
      '/codes/icd-10-cm/F31.10',
      '/codes/icd-10-cm/F31.20',
      '/codes/icd-10-cm/F32',
      '/codes/icd-10-cm/F32.0',
      '/codes/icd-10-cm/F32.1',
    ])
    expect((await get('/sitemaps/codes-2.xml')).status).toBe(404)
  })

  it('answers a page past the last with 404 before reading any codes', async () => {
    const sqls: string[] = []
    const DB = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (query: string) => {
            sqls.push(query)
            return target.prepare(query)
          }
        }
        const value: unknown = Reflect.get(target, prop)
        if (typeof value !== 'function') return value
        const method = value as (...args: unknown[]) => unknown
        return method.bind(target)
      },
    })
    const res = await call('/sitemaps/codes-9999.xml', {
      host: 'sitemap-past.example.com',
      vars: { SITE_MODE: 'public', ASSETS: assets, DB },
    })
    expect(res.status).toBe(404)
    expect(sqls.some((q) => q.includes('count(*) AS n FROM codes'))).toBe(true)
    expect(sqls.filter((q) => q.includes('OFFSET'))).toEqual([])
  })

  it('agrees with the page: a code is in the sitemap exactly when its page is indexed', async () => {
    const xml = await (await get('/sitemaps/codes-1.xml', 'frailty.example.org')).text()
    const listed = new Set(
      [...xml.matchAll(/\/codes\/icd-10-cm\/([^<]+)<\/loc>/g)].map((m) => m[1] ?? ''),
    )
    const ref = await db.select({ norm: refCodes.codeNorm }).from(refCodes)
    for (const { norm } of ref) {
      const display = norm.length > 3 ? `${norm.slice(0, 3)}.${norm.slice(3)}` : norm
      const body = await publicCode(db, 'icd-10-cm', display, 0)
      const indexed = (body?.states ?? []).some(
        (s) => s.status === 'exact' || s.status === 'covered',
      )
      expect(listed.has(display), display).toBe(indexed)
    }
  })

  it('keeps the pages in their own file', async () => {
    const xml = await (await get('/sitemaps/pages.xml', 'frailty.example.org')).text()
    expect(xml).toContain(
      '<url><loc>http://frailty.example.org/states/ga</loc><lastmod>2026-11-02</lastmod></url>',
    )
    expect(xml).not.toContain('/codes/')
    expect(xml).not.toContain('/search')
  })
})
