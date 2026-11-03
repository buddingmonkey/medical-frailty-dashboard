import {
  codeSystemLabels,
  compareCellText,
  compareQuerySchema,
  federalCategoriesText,
  isCodeTableQuery,
  qualificationBasisLabels,
  qualificationLabels,
  SITE_NAME,
  toCsv,
} from '@mfcd/shared'
import { type Context, Hono } from 'hono'

import { createDb } from '../db/client'
import { publicCompare } from '../db/public-compare'
import { publicOverview } from '../db/public-overview'
import { publicStateDetail, publishedEntriesForDownload } from '../db/public-state'
import { publicSummaries } from '../db/public-summary'
import { cachePublic, publicCache } from '../middleware/public-cache'
import {
  comparePage,
  downloadName,
  homePage,
  notFoundPage,
  overviewPage,
  type PageParts,
  renderInto,
  statePage,
  statesPage,
} from '../seo/pages'
import type { AppEnv } from '../types'

// Public pages rendered on the server (roadmap M3 step 4; docs/seo.md), the state downloads and
// the sitemap. Every URL is built from the request's own origin: no host is hard-coded.

/** The built index.html (from the static assets), fetched once per request. */
async function indexHtml(c: Context<AppEnv>): Promise<string> {
  const cached = c.get('indexHtml')
  if (cached !== undefined) return cached
  const res = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)))
  const text = await res.text()
  c.set('indexHtml', text)
  return text
}

/**
 * Pages are cached on data_version and on the web build, so a deploy never serves HTML that
 * names old script files. Browsers revalidate every time; the edge keeps a copy 5 minutes.
 */
const pageCache = cachePublic({
  keyExtra: async (c) => {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(await indexHtml(c)),
    )
    return [...new Uint8Array(digest).slice(0, 8)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  },
  browserCacheControl: 'public, max-age=0, must-revalidate',
})

async function sendPage(c: Context<AppEnv>, parts: PageParts) {
  return c.html(await renderInto(await indexHtml(c), parts), parts.status)
}

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin

const xmlEscape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** `/states/GA` → 301 to `/states/ga`; null when the slug is already lowercase. */
function lowercaseRedirect(c: Context<AppEnv>, slug: string) {
  if (!/^[A-Za-z]{2}$/.test(slug) || slug === slug.toLowerCase()) return null
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(`/states/${slug}`, `/states/${slug.toLowerCase()}`)
  return c.redirect(url.pathname + url.search, 301)
}

async function downloadData(c: Context<AppEnv>) {
  const db = createDb(c.env.DB)
  const detail = await publicStateDetail(db, c.req.param('slug') ?? '', c.get('dataVersion') ?? 0)
  if (!detail?.state.published) return null
  const rows = await publishedEntriesForDownload(db, detail.state.id)
  return { detail, published: detail.state.published, rows }
}

/**
 * `/compare?states=…` and `/compare.csv?…` are links from before M5 step 5, when the code table
 * lived there: 301 to its new address with the same query. Null when the query is not one.
 */
function codeTableRedirect(c: Context<AppEnv>, to: string) {
  const url = new URL(c.req.url)
  if (!isCodeTableQuery(url.searchParams)) return null
  return c.redirect(`${to}${url.search}`, 301)
}

/** The compare query in the URL: null when there is none, else the parsed query or an error. */
function compareQueryOf(c: Context<AppEnv>) {
  const raw = c.req.query()
  if (Object.keys(raw).length === 0) return null
  return compareQuerySchema.safeParse(raw)
}

export const pagesRoute = new Hono<AppEnv>()
  .get('/', pageCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return sendPage(c, homePage(items, origin(c)))
  })
  .get('/states', pageCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return sendPage(c, statesPage(items, origin(c)))
  })
  .get('/compare', async (c, next) => {
    // Before the cache: a redirect is not a page.
    return codeTableRedirect(c, '/compare/codes') ?? next()
  })
  .get('/compare', pageCache, async (c) => {
    const data = await publicOverview(createDb(c.env.DB), c.get('dataVersion') ?? 0)
    return sendPage(c, overviewPage(data, origin(c), c.req.query()))
  })
  .get('/compare.csv', async (c, next) => codeTableRedirect(c, '/compare/codes.csv') ?? next())
  .get('/compare/codes', pageCache, async (c) => {
    const parsed = compareQueryOf(c)
    if (parsed === null) return sendPage(c, comparePage(origin(c), null))
    if (!parsed.success) {
      return sendPage(c, comparePage(origin(c), { error: 'This comparison link is not valid.' }))
    }
    const load = await publicCompare(createDb(c.env.DB), parsed.data)
    return sendPage(
      c,
      comparePage(
        origin(c),
        load.ok
          ? { query: parsed.data, result: load.result }
          : { error: `Unknown state: ${load.unknownStates.join(', ')}` },
      ),
    )
  })
  .get('/compare/codes.csv', publicCache, async (c) => {
    const parsed = compareQueryOf(c)
    if (!parsed?.success) return c.json({ error: 'Invalid compare query' }, 400)
    const query = parsed.data
    const load = await publicCompare(createDb(c.env.DB), query, { allRows: true })
    if (!load.ok) return c.json({ error: `Unknown state: ${load.unknownStates.join(', ')}` }, 400)
    const { result } = load
    const perState = [
      'status',
      'entry',
      'tier',
      'qualification',
      'qualification_basis',
      'state_category',
      'federal_categories',
    ]
    const csv = toCsv([
      [
        'code_system',
        'code',
        'description',
        'description_source',
        ...result.states.flatMap((s) => perState.map((col) => `${s.id}_${col}`)),
      ],
      ...result.rows.map((row) => [
        codeSystemLabels[row.codeSystem],
        row.display,
        row.description,
        row.descriptionSource === 'cms' ? 'CMS' : row.descriptionSource,
        ...row.cells.flatMap((cell) => {
          const m = cell.match
          return [
            compareCellText(cell),
            m?.display ?? null,
            m?.tier ?? null,
            m ? qualificationLabels[m.qualification] : null,
            m ? qualificationBasisLabels[m.qualificationBasis] : null,
            m ? m.stateCategory : null,
            m ? federalCategoriesText(m.federalCategories) : null,
          ]
        }),
      ]),
    ])
    const subject = query.category ?? `${(query.ownState ?? '').toLowerCase()}-own`
    const name = `compare-${subject.replaceAll('_', '-')}-${query.states.join('-').toLowerCase()}.csv`
    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
    })
  })
  .get('/sitemap.xml', publicCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    const base = origin(c)
    const days = items.flatMap((s) =>
      s.published?.updatedAt ? [s.published.updatedAt.slice(0, 10)] : [],
    )
    const newest = days.sort().at(-1)
    const url = (loc: string, lastmod?: string | null) =>
      `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url(`${base}/`, newest),
      url(`${base}/states`, newest),
      url(`${base}/compare`, newest),
      ...items.map((s) => url(`${base}/states/${s.slug}`, s.published?.updatedAt?.slice(0, 10))),
      '</urlset>',
      '',
    ].join('\n')
    return c.body(body, 200, { 'content-type': 'application/xml; charset=utf-8' })
  })
  .get('/states/:slug/codes.csv', publicCache, async (c) => {
    const data = await downloadData(c)
    if (!data) return c.json({ error: 'Not found' }, 404)
    const { detail, published, rows } = data
    const csv = toCsv([
      [
        'state',
        'code_system',
        'code',
        'code_normalized',
        'match_kind',
        'range_end',
        'includes_children',
        'description_published',
        'state_category',
        'state_subcategory',
        'federal_categories',
        'tier',
        'qualification',
        'qualification_basis',
        'source_title',
        'source_url',
        'source_date',
        'source_locator',
      ],
      ...rows.map((r) => [
        detail.state.id,
        codeSystemLabels[r.codeSystem],
        r.rawCode,
        r.codeNorm,
        r.matchKind,
        r.rangeEndNorm,
        r.includesChildren === null ? '' : r.includesChildren === 1 ? 'yes' : 'no',
        r.descriptionPublished,
        r.stateCategory,
        r.stateSubcategory,
        federalCategoriesText(r.federalCategories),
        r.tier,
        qualificationLabels[r.qualification],
        qualificationBasisLabels[r.qualificationBasis],
        r.sourceTitle,
        r.sourceUrl,
        r.sourceDate,
        r.sourceLocator,
      ]),
    ])
    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${downloadName(detail.state.slug, published.versionNo, 'csv')}"`,
    })
  })
  .get('/states/:slug/codes.json', publicCache, async (c) => {
    const data = await downloadData(c)
    if (!data) return c.json({ error: 'Not found' }, 404)
    const { detail, published, rows } = data
    const body = {
      state: detail.state.id,
      name: detail.state.name,
      version: published.versionNo,
      sourceDate: published.sourceDate,
      updatedAt: published.updatedAt,
      url: `${origin(c)}/states/${detail.state.slug}`,
      publisher: SITE_NAME,
      note: 'Descriptions are the text the state published, cited to its source document.',
      sources: detail.sources,
      entries: rows.map((r) => ({
        codeSystem: r.codeSystem,
        code: r.rawCode,
        codeNormalized: r.codeNorm,
        matchKind: r.matchKind,
        rangeEnd: r.rangeEndNorm,
        includesChildren: r.includesChildren === null ? null : r.includesChildren === 1,
        descriptionPublished: r.descriptionPublished,
        stateCategory: r.stateCategory,
        stateSubcategory: r.stateSubcategory,
        federalCategories: r.federalCategories,
        tier: r.tier,
        qualification: r.qualification,
        qualificationBasis: r.qualificationBasis,
        sourceTitle: r.sourceTitle,
        sourceLocator: r.sourceLocator,
      })),
    }
    return c.body(JSON.stringify(body), 200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${downloadName(detail.state.slug, published.versionNo, 'json')}"`,
    })
  })
  .get('/states/:slug', async (c, next) => {
    // Before the cache: a redirect is not a page.
    return lowercaseRedirect(c, c.req.param('slug')) ?? next()
  })
  .get('/states/:slug', pageCache, async (c) => {
    const detail = await publicStateDetail(
      createDb(c.env.DB),
      c.req.param('slug'),
      c.get('dataVersion') ?? 0,
    )
    return sendPage(c, detail ? statePage(detail, origin(c)) : notFoundPage(origin(c), c.req.path))
  })
