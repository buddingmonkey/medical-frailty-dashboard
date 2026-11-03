import {
  coverageBand,
  type CoverageBand,
  coverageBandLabels,
  type OverviewCategory,
  overviewCellLabel,
  overviewCellNotReviewed,
  overviewCellText,
  overviewDrillDownPath,
  OVERVIEW_NO_LIST,
  type PublicOverviewResponse,
} from './overview'

// The tile map (roadmap M5 step 8): one published unified category across the country, an
// equal square per state in a US tile-grid layout, with the overview's numbers and shades
// (`coverageBand`). The Map tab (`/compare/map`; on the home page until the project lead moved
// it, 2026-11-03) and the Worker's server-rendered HTML both use these.

export const TILE_MAP_COLUMNS = 11
export const TILE_MAP_ROWS = 8

export const TILE_MAP_HEADING = 'One category across the country'

/** The home page's link to the Map tab, under its States section (Vue and server-rendered). */
export const TILE_MAP_HOME_LINK = 'See one category across the country on the map'

export interface TileMapPlace {
  /** Two-letter postal code (`states.id`). */
  id: string
  /** Shown when the overview has no row for the state. */
  name: string
  /** 0-based grid row and column. */
  row: number
  col: number
}

const place = (id: string, name: string, row: number, col: number): TileMapPlace => ({
  id,
  name,
  row,
  col,
})

/** The 50 states and DC on an 11 × 8 grid (the approved mockup), west left, north up. */
export const usTileLayout: readonly TileMapPlace[] = [
  place('AK', 'Alaska', 0, 0),
  place('ME', 'Maine', 0, 10),
  place('VT', 'Vermont', 1, 9),
  place('NH', 'New Hampshire', 1, 10),
  place('WA', 'Washington', 2, 0),
  place('ID', 'Idaho', 2, 1),
  place('MT', 'Montana', 2, 2),
  place('ND', 'North Dakota', 2, 3),
  place('MN', 'Minnesota', 2, 4),
  place('IL', 'Illinois', 2, 5),
  place('WI', 'Wisconsin', 2, 6),
  place('MI', 'Michigan', 2, 7),
  place('NY', 'New York', 2, 8),
  place('RI', 'Rhode Island', 2, 9),
  place('MA', 'Massachusetts', 2, 10),
  place('OR', 'Oregon', 3, 0),
  place('NV', 'Nevada', 3, 1),
  place('WY', 'Wyoming', 3, 2),
  place('SD', 'South Dakota', 3, 3),
  place('IA', 'Iowa', 3, 4),
  place('IN', 'Indiana', 3, 5),
  place('OH', 'Ohio', 3, 6),
  place('PA', 'Pennsylvania', 3, 7),
  place('NJ', 'New Jersey', 3, 8),
  place('CT', 'Connecticut', 3, 9),
  place('CA', 'California', 4, 0),
  place('UT', 'Utah', 4, 1),
  place('CO', 'Colorado', 4, 2),
  place('NE', 'Nebraska', 4, 3),
  place('MO', 'Missouri', 4, 4),
  place('KY', 'Kentucky', 4, 5),
  place('WV', 'West Virginia', 4, 6),
  place('VA', 'Virginia', 4, 7),
  place('MD', 'Maryland', 4, 8),
  place('DE', 'Delaware', 4, 9),
  place('AZ', 'Arizona', 5, 1),
  place('NM', 'New Mexico', 5, 2),
  place('KS', 'Kansas', 5, 3),
  place('AR', 'Arkansas', 5, 4),
  place('TN', 'Tennessee', 5, 5),
  place('NC', 'North Carolina', 5, 6),
  place('SC', 'South Carolina', 5, 7),
  place('DC', 'District of Columbia', 5, 8),
  place('OK', 'Oklahoma', 6, 3),
  place('LA', 'Louisiana', 6, 4),
  place('MS', 'Mississippi', 6, 5),
  place('AL', 'Alabama', 6, 6),
  place('GA', 'Georgia', 6, 7),
  place('HI', 'Hawaii', 7, 0),
  place('TX', 'Texas', 7, 3),
  place('FL', 'Florida', 7, 8),
]

/** A tile's short text for a state without a list (the table says `OVERVIEW_NO_LIST`). */
export const TILE_MAP_NO_LIST = 'No list'
/** A tile's text for a state with a list but no entry in the category. */
export const TILE_MAP_NONE = 'none'

/** The overview's four bands, plus the shade of a state without a list. */
export type TileMapShade = CoverageBand | 'nolist'

export interface TileMapTile extends TileMapPlace {
  slug: string
  /** On the tile: a percentage, "none" or "No list". */
  text: string
  /** In the table beneath: a percentage, "None listed" or "No list on this site yet". */
  tableText: string
  shade: TileMapShade
  /** Some of the cell's codes were placed without an admin's review (shown as *). */
  notReviewed: boolean
  /** The drill-down with the state in focus; null for a state without a list. */
  href: string | null
  /** The accessible name: the state, the category and the full text. */
  label: string
}

/** One value of a URL parameter (the first when repeated), as Vue Router or Hono give them. */
function queryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/**
 * The category in the URL (`?category=<slug>`); the first (federal order, then sort order and
 * label, as the overview sends them) when absent or unknown; null when none is published.
 */
export function tileMapCategory(
  categories: readonly OverviewCategory[],
  query: Readonly<Record<string, unknown>>,
): OverviewCategory | null {
  const slug = queryValue(query['category'])
  return categories.find((c) => c.slug === slug) ?? categories[0] ?? null
}

/** The category as URL parameters; the default is left out, so `/` stays `/`. */
export function tileMapQuery(
  categories: readonly Pick<OverviewCategory, 'slug'>[],
  slug: string,
): Record<string, string> {
  return categories[0]?.slug === slug ? {} : { category: slug }
}

/** Every state and DC as a tile, in order of name (the reading order for screen readers). */
export function tileMapTiles(
  data: PublicOverviewResponse,
  category: OverviewCategory,
): TileMapTile[] {
  const index = data.categories.findIndex((c) => c.id === category.id)
  const byId = new Map(data.states.map((s) => [s.id, s]))
  return usTileLayout
    .map((p): TileMapTile => {
      const state = byId.get(p.id)
      const name = state?.name ?? p.name
      const slug = state?.slug ?? p.id.toLowerCase()
      const cell = state?.hasList ? state.cells[index] : undefined
      if (!state || !cell) {
        return {
          ...p,
          name,
          slug,
          text: TILE_MAP_NO_LIST,
          tableText: OVERVIEW_NO_LIST,
          shade: 'nolist',
          notReviewed: false,
          href: null,
          label: `${name}, ${category.label}: ${OVERVIEW_NO_LIST}`,
        }
      }
      const none = cell.entries === 0
      return {
        ...p,
        name,
        slug,
        text: none ? TILE_MAP_NONE : overviewCellText(cell.share),
        tableText: none ? coverageBandLabels.none : overviewCellText(cell.share),
        shade: coverageBand(cell.share),
        notReviewed: overviewCellNotReviewed(cell),
        href: overviewDrillDownPath(category.slug, p.id),
        label: overviewCellLabel(name, category, cell),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** The map's and the table's name: what the number is a share of. */
export const tileMapCaption = (category: OverviewCategory): string =>
  category.coverageBasis === 'universe'
    ? `${category.label}: share of the category’s codes that each state lists`
    : `${category.label}: each state’s share of the codes any state lists`

/** Under the map when a tile carries the * mark. */
export const TILE_MAP_NOT_REVIEWED_NOTE =
  '* Not reviewed: some of the state’s codes in this category were placed by their CCSR group, ' +
  'and an admin has not yet reviewed how the state’s categories map to ours.'

/** The Map tab's introduction, in the Vue page and the server-rendered HTML. */
export const TILE_MAP_INTRO =
  'Pick a category to see every state at once. Each number is the share of the category’s ' +
  'codes that the state lists; select a state to see its codes in the category.'
