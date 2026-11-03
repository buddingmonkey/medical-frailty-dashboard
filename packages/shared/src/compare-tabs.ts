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

export const CATEGORIES_HEADING = 'Comparison categories'

export const CATEGORIES_INTRO =
  'These comparison categories are this site’s own grouping, built so that every state’s list ' +
  'can be measured the same way. They are not a state’s or CMS’s categories. Most are built ' +
  'from AHRQ’s CCSR diagnosis groups; a state’s own category can also be mapped to one, which ' +
  'brings in its other codes, such as service codes. Each is filed under a federal category. ' +
  'Choose one to see its codes and how many states include each.'

/** The link text to AHRQ's CCSR page (`CCSR_URL`). */
export const CCSR_LINK_TEXT = 'About the CCSR (AHRQ)'

export const CATEGORIES_DESCRIPTION =
  'Every comparison category this site measures state medical frailty code lists by, grouped ' +
  'under the federal categories in H.R.1.'

export const MAP_DESCRIPTION =
  'A map of the US for one comparison category at a time: the share of the category’s ' +
  'diagnosis codes that each state’s medical frailty code list includes.'

export const STATES_LANDING_HEADING = 'States side by side'

export const STATES_LANDING_INTRO =
  'Compare the lists of 2 to 4 states code by code. Start from your state to see the states ' +
  'whose lists are most like it, or choose the states yourself. Only states with a list on ' +
  'this site can be chosen.'

export const STATES_LANDING_DESCRIPTION =
  'Compare the medical frailty code lists of 2 to 4 states side by side.'

export const STATES_LANDING_OWN_HEADING = 'Start from your state'
export const STATES_LANDING_OWN_LABEL = 'Your state'
export const STATES_LANDING_PICK_HEADING = 'Choose 2 to 4 states'

const tabPaths: readonly string[] = compareTabs.map((t) => t.path)

/** The tab a page belongs to, and whether it is that tab's page or a deeper one. */
function currentTab(path: string): { path: string; deeper: boolean } | null {
  // Trailing slashes off by a loop: `/\/+$/` backtracks for seconds on many inner slashes.
  let end = path.length
  while (end > 1 && path[end - 1] === '/') end -= 1
  const p = path.slice(0, end)
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
