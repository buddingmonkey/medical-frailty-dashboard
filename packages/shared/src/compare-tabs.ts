// The tab row on every `/compare` page (project lead, 2026-11-02): one list for the Vue
// component and the Worker's server-rendered HTML, so both show the same tabs. Links, not ARIA
// tabs: each view is a page with its own URL. Every path after `/compare/` is a reserved
// unified slug (`reservedUnifiedSlugs`), since `/compare/<slug>` is a category page.

export const compareTabs = [
  { label: 'Overview', path: '/compare' },
  { label: 'Categories', path: '/compare/categories' },
  { label: 'Map', path: '/compare/map' },
  { label: 'States side by side', path: '/compare/states' },
  { label: 'Single codes', path: '/compare/codes' },
] as const

export type CompareTab = (typeof compareTabs)[number]

/** The accessible name of the tab row's `<nav>`. */
export const COMPARE_TABS_LABEL = 'Compare views'

// The words of the tab pages that are new with the tabs, for the Vue pages and the Worker's
// HTML. On the legal review list (docs/status.md).

export const CATEGORIES_HEADING = 'Categories for comparing states'

export const CATEGORIES_INTRO =
  'Each category groups related diagnosis and service codes, under its federal category in the ' +
  'law. Choose a category to see its codes and how many states list each one.'

export const CATEGORIES_DESCRIPTION =
  'Every category this site compares state medical frailty code lists by, grouped under the ' +
  'federal categories in H.R.1.'

export const MAP_DESCRIPTION =
  'A map of the US for one category at a time: the share of the category’s codes that each ' +
  'state’s medical frailty list includes.'

export const STATES_LANDING_HEADING = 'States side by side'

export const STATES_LANDING_INTRO =
  'Compare the lists of 2 to 4 states code by code. Start from your state to see the states ' +
  'whose lists are most like it, or choose the states yourself.'

export const STATES_LANDING_DESCRIPTION =
  'Compare the medical frailty code lists of 2 to 4 states side by side.'

export const STATES_LANDING_OWN_HEADING = 'Start from your state'
export const STATES_LANDING_OWN_LABEL = 'Your state'
export const STATES_LANDING_PICK_HEADING = 'Choose 2 to 4 states'

const tabPaths: readonly string[] = compareTabs.map((t) => t.path)

/** The tab a page belongs to, and whether it is that tab's page or a deeper one. */
function currentTab(path: string): { path: string; deeper: boolean } | null {
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (tabPaths.includes(p)) return { path: p, deeper: false }
  if (/^\/compare\/states\/[^/]+$/.test(p)) return { path: '/compare/states', deeper: true }
  // `/compare/<slug>`: a category page (the reserved slugs are the tabs above).
  if (/^\/compare\/[a-z0-9-]+$/.test(p)) return { path: '/compare/categories', deeper: true }
  return null
}

/**
 * `aria-current` for a tab on the page at `path`: `page` on the tab's own page, `true` on a
 * deeper page under it (a category page under Categories, a comparison under States side by
 * side), null otherwise.
 */
export function compareTabMark(tabPath: string, path: string): 'page' | 'true' | null {
  const current = currentTab(path)
  if (current?.path !== tabPath) return null
  return current.deeper ? 'true' : 'page'
}
