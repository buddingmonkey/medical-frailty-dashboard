import { compareQueryKeys, drillQueryKeys, infoPages, statesCompareQueryKeys } from '@mfcd/shared'

// The query parameters each cached route reads (docs/architecture.md, "Caching"). The edge
// cache key keeps only these, sorted, so `?utm_source=…` or a random cache-buster is answered
// from the cache instead of costing D1 reads. Keyed by the route pattern as Hono registered it
// (`routePath`): the cache middleware's own mount for the JSON API, the page's route for
// src/routes/pages.ts. A handler must read no parameter that is not listed here, or two
// different answers would share one entry. A route missing from this table keeps every
// parameter (safe, only less cached); a test checks that every cached route is listed.

const none: readonly string[] = []
const overviewOrder = ['order', 'sort', 'dir'] as const
const codeSearch = ['q', 'states', 'system', 'limit'] as const

const params: Readonly<Record<string, readonly string[]>> = {
  // JSON API (src/app.ts)
  '/api/public/states': none,
  '/api/public/states/*': none,
  '/api/public/compare': compareQueryKeys,
  '/api/public/overview': none,
  '/api/public/overlaps': ['category'],
  '/api/public/categories/*': drillQueryKeys,
  '/api/public/states-compare': ['states', ...statesCompareQueryKeys],
  // Search and one code's detail share the mount; the detail reads none of these.
  '/api/public/codes/*': codeSearch,
  // Server-rendered pages, downloads and the sitemap (src/routes/pages.ts)
  '/': none,
  '/states': none,
  ...Object.fromEntries(infoPages.map((page) => [page.path, none])),
  '/search': none,
  '/codes/:system/:code': none,
  '/compare': overviewOrder,
  '/compare/categories': none,
  '/compare/map': ['category'],
  '/compare/overlaps': ['category'],
  '/compare/codes': compareQueryKeys,
  '/compare/codes.csv': compareQueryKeys,
  '/compare/states': ['state'],
  '/compare/states/:pair': statesCompareQueryKeys,
  '/compare/states/:pair/codes.csv': none,
  '/compare/:slug': drillQueryKeys,
  '/compare/:slug/codes.csv': drillQueryKeys,
  '/sitemap.xml': none,
  '/llms.txt': none,
  '/sitemaps/:file': none,
  '/states/:slug': none,
  '/states/:slug/codes.csv': none,
  '/states/:slug/codes.json': none,
}

/** The parameters the route reads, or null when the route is not in the table. */
export function cacheQueryParams(routePath: string): readonly string[] | null {
  return Object.hasOwn(params, routePath) ? (params[routePath] ?? null) : null
}

/**
 * The query part of a cache key: the `allowed` parameters (every one when null), sorted by
 * name; repeated values keep their order, which some routes read.
 */
export function canonicalCacheSearch(
  search: URLSearchParams,
  allowed: readonly string[] | null,
): string {
  const kept = [...search].filter(([name]) => allowed === null || allowed.includes(name))
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new URLSearchParams(kept).toString()
}
