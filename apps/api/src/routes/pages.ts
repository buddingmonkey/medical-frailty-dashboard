import {
  codeSystemLabels,
  federalCategoryInfo,
  qualificationBasisLabels,
  qualificationLabels,
  SITE_NAME,
  toCsv,
} from '@mfcd/shared'
import { type Context, Hono } from 'hono'

import { createDb } from '../db/client'
import { publicStateDetail, publishedEntriesForDownload } from '../db/public-state'
import { publicSummaries } from '../db/public-summary'
import { cachePublic, publicCache } from '../middleware/public-cache'
import {
  downloadName,
  homePage,
  notFoundPage,
  type PageParts,
  renderInto,
  statePage,
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

export const pagesRoute = new Hono<AppEnv>()
  .get('/', pageCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return sendPage(c, homePage(items, origin(c)))
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
        'federal_category',
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
        federalCategoryInfo[r.federalCategory].label,
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
        federalCategory: r.federalCategory,
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
