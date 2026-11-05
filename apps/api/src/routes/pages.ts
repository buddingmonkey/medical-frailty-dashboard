import {
  aboutPage,
  accessibilityPage,
  codeSystemLabels,
  disclaimerPage,
  infoPages,
  privacyPage,
  codeUrlPath,
  COMPARE_INVALID_LINK,
  compareUnknownStatesText,
  compareCellText,
  compareQuerySchema,
  drillQueryFromRecord,
  federalCategoriesText,
  drillFiledUnder,
  isCodeTableQuery,
  parseCodeUrl,
  parseStatesPair,
  SITEMAP_MAX_URLS,
  sitemapCodeFiles,
  qualificationBasisLabels,
  qualificationLabels,
  SITE_NAME,
  STATES_COMPARE_MAX,
  STATES_COMPARE_MIN,
  statesComparePath,
  statesCompareQueryFromRecord,
} from '@mfcd/shared'
import { asc, eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { createDb } from '../db/client'
import { publicCode } from '../db/public-code'
import { includedCodeCount, includedCodePage, listsUpdatedAt } from '../db/public-code-sitemap'
import { publicCompare } from '../db/public-compare'
import { publicDrill, publicDrillCsv, publicDrillDetail } from '../db/public-drill'
import { publicOverview } from '../db/public-overview'
import { publicStateDetail, publishedEntriesForDownload } from '../db/public-state'
import { publicStatesCompare, publicStatesCompareCsv } from '../db/public-states-compare'
import { publicSummaries } from '../db/public-summary'
import { unifiedCategories } from '../db/schema'
import { cachePublic, publicCache } from '../middleware/public-cache'
import {
  categoriesPage,
  categoryNotFoundPage,
  comparePage,
  drillPage,
  downloadName,
  homePage,
  mapPage,
  notFoundPage,
  overviewPage,
  type PageParts,
  renderInto,
  statePage,
  statesComparePage,
  statesCompareNotFoundPage,
  statesLandingPage,
  statesPage,
} from '../seo/pages'
import { codeNotFoundPage, codePage, searchPage } from '../seo/code-page'
import { infoPageParts } from '../seo/info-page'
import type { AppEnv } from '../types'
import { CODE_CSV_COLUMNS, codeCsvCells, csvResponse, perStateCsvColumns } from './csv'

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
  // The header too, for crawlers that read headers before markup (M6 step 5). While the site
  // is private, the site gate replaces it with `noindex, nofollow` on every response.
  if (parts.noindex) c.header('X-Robots-Tag', 'noindex')
  // The footer's "Data last updated" (M8 step 4): from the page's own query when it has it
  // (the state summaries, a code page), else one small aggregate over the published versions.
  // Only on a cache miss: the page cache sits in front of this.
  const dataUpdatedAt =
    parts.dataUpdatedAt !== undefined
      ? parts.dataUpdatedAt
      : await listsUpdatedAt(createDb(c.env.DB))
  return c.html(await renderInto(await indexHtml(c), { ...parts, dataUpdatedAt }), parts.status)
}

const safeDecode = (path: string) => {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/**
 * `/codes/icd-10-cm/f200`, `/codes/ICD-10-CM/F20.0` → 301 to `/codes/icd-10-cm/F20.0`
 * (`codeUrlPath`). Null when the path is already canonical or names no code.
 */
function codeRedirect(c: Context<AppEnv>) {
  const parsed = parseCodeUrl(c.req.param('system')?.toLowerCase() ?? '', c.req.param('code') ?? '')
  if (!parsed) return null
  const url = new URL(c.req.url)
  if (safeDecode(url.pathname) === safeDecode(parsed.canonicalPath)) return null
  return c.redirect(parsed.canonicalPath + url.search, 301)
}

const xmlHead = '<?xml version="1.0" encoding="UTF-8"?>'
const sitemapNs = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
const xmlResponse = (c: Context<AppEnv>, lines: string[]) =>
  c.body([...lines, ''].join('\n'), 200, { 'content-type': 'application/xml; charset=utf-8' })
const sitemapUrl = (loc: string, lastmod?: string | null) =>
  `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`

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

/**
 * `/?category=<slug>` is a link from before 2026-11-03, when the tile map was on the home page:
 * 301 to the Map tab with the same query. Null when the query has no `category`.
 */
function tileMapRedirect(c: Context<AppEnv>) {
  const url = new URL(c.req.url)
  if (!url.searchParams.has('category')) return null
  return c.redirect(`/compare/map${url.search}`, 301)
}

/** The compare query in the URL: null when there is none, else the parsed query or an error. */
function compareQueryOf(c: Context<AppEnv>) {
  const raw = c.req.query()
  if (Object.keys(raw).length === 0) return null
  return compareQuerySchema.safeParse(raw)
}

export const pagesRoute = new Hono<AppEnv>()
  .get('/', async (c, next) => {
    // Before the cache: a redirect is not a page.
    return tileMapRedirect(c) ?? next()
  })
  .get('/', pageCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return sendPage(c, homePage(items, origin(c)))
  })
  .get('/states', pageCache, async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return sendPage(c, statesPage(items, origin(c)))
  })
  // About/methodology, disclaimer, privacy, accessibility (roadmap M8 step 4): fixed words.
  .get(aboutPage.path, pageCache, async (c) => sendPage(c, infoPageParts(aboutPage, origin(c))))
  .get(disclaimerPage.path, pageCache, async (c) =>
    sendPage(c, infoPageParts(disclaimerPage, origin(c))),
  )
  .get(privacyPage.path, pageCache, async (c) => sendPage(c, infoPageParts(privacyPage, origin(c))))
  .get(accessibilityPage.path, pageCache, async (c) =>
    sendPage(c, infoPageParts(accessibilityPage, origin(c))),
  )
  // Search runs in the browser; the server sends its heading and `noindex` (M6 step 5).
  .get('/search', pageCache, async (c) => sendPage(c, searchPage(origin(c))))
  // One code's page (roadmap M6 step 5), from the API's loader: there is one matcher.
  .get('/codes/:system/:code', async (c, next) => {
    // Before the cache: a redirect is not a page.
    return codeRedirect(c) ?? next()
  })
  .get('/codes/:system/:code', pageCache, async (c) => {
    const db = createDb(c.env.DB)
    const [detail, updatedAt] = await Promise.all([
      publicCode(db, c.req.param('system'), c.req.param('code'), c.get('dataVersion') ?? 0),
      listsUpdatedAt(db),
    ])
    return sendPage(
      c,
      detail ? codePage(detail, origin(c), updatedAt) : codeNotFoundPage(origin(c), c.req.path),
    )
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
  // The compare tabs (project lead, 2026-11-02). Before `/compare/:slug`; both slugs are
  // reserved. Each reads the overview, cached on data_version.
  .get('/compare/categories', pageCache, async (c) => {
    const data = await publicOverview(createDb(c.env.DB), c.get('dataVersion') ?? 0)
    return sendPage(c, categoriesPage(data, origin(c)))
  })
  .get('/compare/map', pageCache, async (c) => {
    const data = await publicOverview(createDb(c.env.DB), c.get('dataVersion') ?? 0)
    return sendPage(c, mapPage(data, origin(c), c.req.query()))
  })
  .get('/compare/codes', pageCache, async (c) => {
    const parsed = compareQueryOf(c)
    if (parsed === null) return sendPage(c, comparePage(origin(c), null))
    if (!parsed.success) {
      return sendPage(c, comparePage(origin(c), { error: COMPARE_INVALID_LINK }))
    }
    const load = await publicCompare(createDb(c.env.DB), parsed.data)
    return sendPage(
      c,
      comparePage(
        origin(c),
        load.ok
          ? { query: parsed.data, result: load.result }
          : { error: compareUnknownStatesText(load.unknownStates) },
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
    const rows = [
      [...CODE_CSV_COLUMNS, ...perStateCsvColumns(result.states, perState)],
      ...result.rows.map((row) => [
        ...codeCsvCells(row),
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
    ]
    const subject = query.category ?? `${(query.ownState ?? '').toLowerCase()}-own`
    const name = `compare-${subject.replaceAll('_', '-')}-${query.states.join('-').toLowerCase()}.csv`
    return csvResponse(c, rows, name)
  })
  // Compare 2–4 states (roadmap M5 step 7). Before `/compare/:slug…`, which `states` would
  // otherwise reach as a category slug (it is reserved).
  .get('/compare/states', async (c, next) => {
    // Without `?states=`, the States side by side landing (below, cached).
    if (c.req.queries('states') === undefined) return next()
    // The pickers' GET form without JavaScript: `?states=ga&states=mt` → the comparison.
    const picked = [
      ...new Set(
        c.req
          .queries('states')
          ?.map((s) => s.trim().toLowerCase())
          .filter((s) => /^[a-z]{2}$/.test(s)) ?? [],
      ),
    ]
    if (picked.length < STATES_COMPARE_MIN || picked.length > STATES_COMPARE_MAX) {
      return sendPage(
        c,
        statesCompareNotFoundPage(origin(c), c.req.path, 'Choose 2 to 4 different states.'),
      )
    }
    return c.redirect(statesComparePath(picked.map((s) => s.toUpperCase())), 302)
  })
  .get('/compare/states', pageCache, async (c) => {
    // `?state=ga`: that state's most similar states. Anything else shows the landing alone.
    const db = createDb(c.env.DB)
    const slug = (c.req.query('state') ?? '').trim().toLowerCase()
    const [{ items }, own] = await Promise.all([
      publicSummaries(db),
      /^[a-z]{2}$/.test(slug) ? publicStateDetail(db, slug, c.get('dataVersion') ?? 0) : null,
    ])
    return sendPage(c, statesLandingPage(items, own, origin(c)))
  })
  .get('/compare/states/:pair/codes.csv', publicCache, async (c) => {
    const ids = parseStatesPair(c.req.param('pair'))
    const data = ids ? await publicStatesCompareCsv(createDb(c.env.DB), ids) : null
    if (!ids || !data) return c.json({ error: 'Not found' }, 404)
    const perState = ['status', 'entry', 'tier', 'qualification', 'state_category']
    const rows = [
      [
        ...CODE_CSV_COLUMNS,
        'unified_categories',
        'differs',
        ...perStateCsvColumns(data.states, perState),
      ],
      ...data.rows.map((row) => [
        ...codeCsvCells(row),
        row.groups,
        row.differs ? 'yes' : 'no',
        ...row.cells.flatMap((cell) => {
          const m = cell.match
          return [
            compareCellText(cell),
            m?.display ?? null,
            m?.tier ?? null,
            m ? qualificationLabels[m.qualification] : null,
            m ? drillFiledUnder(m) : null,
          ]
        }),
      ]),
    ]
    return csvResponse(
      c,
      rows,
      `compare-${ids.join('-vs-').toLowerCase()}-medical-frailty-codes.csv`,
    )
  })
  .get('/compare/states/:pair', async (c, next) => {
    // Before the cache: a redirect is not a page. `/compare/states/GA-vs-MT` → lowercase.
    const pair = c.req.param('pair')
    if (pair === pair.toLowerCase() || parseStatesPair(pair.toLowerCase()) === null) return next()
    const url = new URL(c.req.url)
    return c.redirect(`/compare/states/${pair.toLowerCase()}${url.search}`, 301)
  })
  .get('/compare/states/:pair', pageCache, async (c) => {
    const ids = parseStatesPair(c.req.param('pair'))
    const query = statesCompareQueryFromRecord(c.req.queries())
    const data = ids
      ? await publicStatesCompare(createDb(c.env.DB), ids, query, {
          dataVersion: c.get('dataVersion') ?? 0,
        })
      : null
    if (!data) return sendPage(c, statesCompareNotFoundPage(origin(c), c.req.path))
    return sendPage(c, statesComparePage(data, query, origin(c), c.req.path))
  })
  .get('/compare/:slug/codes.csv', publicCache, async (c) => {
    const slug = c.req.param('slug')
    const data = await publicDrillCsv(
      createDb(c.env.DB),
      slug,
      drillQueryFromRecord(c.req.queries()),
    )
    if (!data) return c.json({ error: 'Not found' }, 404)
    const rows = [
      [
        ...CODE_CSV_COLUMNS,
        'group',
        'states_listing',
        'states_with_list',
        ...data.states.map((s) => s.id),
      ],
      ...data.rows.map((row) => [
        ...codeCsvCells(row),
        row.codeSystem === 'icd10cm' ? row.codeNorm.slice(0, 3) : codeSystemLabels[row.codeSystem],
        String(row.count),
        String(data.states.length),
        ...row.cells.map((cell) => compareCellText(cell)),
      ]),
    ]
    return csvResponse(c, rows, `${data.category.slug}-codes-by-state.csv`)
  })
  .get('/compare/:slug', pageCache, async (c) => {
    const db = createDb(c.env.DB)
    const slug = c.req.param('slug')
    const query = drillQueryFromRecord(c.req.queries())
    const dataVersion = c.get('dataVersion') ?? 0
    const [data, detail] = await Promise.all([
      publicDrill(db, slug, query, { dataVersion }),
      query.code === null ? null : publicDrillDetail(db, slug, query.code, dataVersion),
    ])
    if (!data) return sendPage(c, categoryNotFoundPage(origin(c), c.req.path))
    const hasQuery = new URL(c.req.url).search !== ''
    return sendPage(c, drillPage(data, query, detail, origin(c), hasQuery))
  })
  // The sitemap (docs/seo.md, "Sitemap"): an index of the pages' file and the code pages' files,
  // at most SITEMAP_MAX_URLS each.
  .get('/sitemap.xml', publicCache, async (c) => {
    const db = createDb(c.env.DB)
    const [count, updatedAt] = await Promise.all([includedCodeCount(db), listsUpdatedAt(db)])
    const base = origin(c)
    const lastmod = updatedAt ? `<lastmod>${updatedAt.slice(0, 10)}</lastmod>` : ''
    const file = (name: string) =>
      `<sitemap><loc>${xmlEscape(`${base}/sitemaps/${name}`)}</loc>${lastmod}</sitemap>`
    return xmlResponse(c, [
      xmlHead,
      `<sitemapindex ${sitemapNs}>`,
      file('pages.xml'),
      ...Array.from({ length: sitemapCodeFiles(count) }, (_, i) =>
        file(`codes-${String(i + 1)}.xml`),
      ),
      '</sitemapindex>',
    ])
  })
  .get('/sitemaps/:file', publicCache, async (c, next) => {
    const name = c.req.param('file')
    if (name !== 'pages.xml') {
      // `codes-<n>.xml`: the n-th SITEMAP_MAX_URLS included codes.
      const n = /^codes-([1-9]\d{0,3})\.xml$/.exec(name)?.[1]
      if (n === undefined) return next()
      const db = createDb(c.env.DB)
      const [codes, updatedAt] = await Promise.all([
        includedCodePage(db, (Number(n) - 1) * SITEMAP_MAX_URLS, SITEMAP_MAX_URLS),
        listsUpdatedAt(db),
      ])
      if (codes.length === 0) return c.text('Not found', 404)
      const base = origin(c)
      const day = updatedAt?.slice(0, 10)
      return xmlResponse(c, [
        xmlHead,
        `<urlset ${sitemapNs}>`,
        ...codes.flatMap((r) => {
          const path = codeUrlPath(r.sys, r.norm)
          return path ? [sitemapUrl(`${base}${path}`, day)] : []
        }),
        '</urlset>',
      ])
    }
    const db = createDb(c.env.DB)
    const [{ items }, categories] = await Promise.all([
      publicSummaries(db),
      db
        .select({ slug: unifiedCategories.slug, updatedAt: unifiedCategories.updatedAt })
        .from(unifiedCategories)
        .where(eq(unifiedCategories.status, 'published'))
        .orderBy(asc(unifiedCategories.sortOrder), asc(unifiedCategories.slug)),
    ])
    const base = origin(c)
    const days = items.flatMap((s) =>
      s.published?.updatedAt ? [s.published.updatedAt.slice(0, 10)] : [],
    )
    const newest = days.sort().at(-1)
    const url = sitemapUrl
    const body = [
      xmlHead,
      `<urlset ${sitemapNs}>`,
      url(`${base}/`, newest),
      url(`${base}/states`, newest),
      url(`${base}/compare`, newest),
      // The compare tabs that are indexed (`/compare/states` is not; docs/seo.md).
      url(`${base}/compare/categories`, newest),
      url(`${base}/compare/map`, newest),
      // A category page changes with its own edits and with any state's list.
      ...categories.map((u) => {
        const day = u.updatedAt.slice(0, 10)
        return url(`${base}/compare/${u.slug}`, newest !== undefined && newest > day ? newest : day)
      }),
      ...items.map((s) => url(`${base}/states/${s.slug}`, s.published?.updatedAt?.slice(0, 10))),
      // About/methodology and the policy pages: fixed words, so no lastmod.
      ...infoPages.map((page) => url(`${base}${page.path}`)),
      '</urlset>',
      '',
    ].join('\n')
    return c.body(body, 200, { 'content-type': 'application/xml; charset=utf-8' })
  })
  .get('/states/:slug/codes.csv', publicCache, async (c) => {
    const data = await downloadData(c)
    if (!data) return c.json({ error: 'Not found' }, 404)
    const { detail, published, rows } = data
    const table = [
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
    ]
    return csvResponse(c, table, downloadName(detail.state.slug, published.versionNo, 'csv'))
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
      note:
        'descriptionPublished is the text the state published, or null where it published none. ' +
        'Each entry cites its source document and where in it (sourceLocator).',
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
