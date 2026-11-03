import {
  CATEGORIES_DESCRIPTION,
  CATEGORIES_HEADING,
  CATEGORIES_INTRO,
  type CodeSystem,
  codeSystemLabels,
  COMPARE_TABS_LABEL,
  compareTabMark,
  compareTabs,
  compareCellText,
  compareFiledUnder,
  compareQualificationText,
  type CompareQuery,
  type CompareResult,
  compareSearchParams,
  compareSubject,
  coverageBandLabels,
  CCSR_CITATION,
  type DrillCell,
  drillCodeTablePath,
  drillCountText,
  drillCsvPath,
  type DrillDetailResponse,
  drillFiledUnder,
  drillGroupCountText,
  type DrillQuery,
  type DrillResponse,
  type DrillRow,
  drillRulesText,
  drillSearchParams,
  drillShowLabels,
  drillShows,
  drillStatusText,
  drillUniverseNote,
  type FederalCategory,
  FEDERAL_OVERLAP_NOTE,
  federalCategoryInfo,
  federalCountsOverlap,
  formatCount,
  formatDay,
  MAP_DESCRIPTION,
  OVERVIEW_DESCRIPTION,
  OVERVIEW_NO_LIST,
  OVERVIEW_NOT_REVIEWED,
  overviewCategoryGroups,
  overviewCellNotReviewed,
  overviewCellText,
  overviewDrillDownPath,
  overviewOrderFromQuery,
  overviewOverall,
  overviewReadingNotes,
  orderOverviewStates,
  pageTitles,
  type PublicOverviewResponse,
  type PublicStateDetail,
  type PublicStateSummary,
  type Qualification,
  qualificationLabels,
  SITE_NAME,
  siteNav,
  siteNavCurrent,
  stateCategoriesIntro,
  stateStatusLabels,
  STATES_AND_DC,
  SIMILAR_PICK_MAX,
  type SimilarState,
  SIMILARITY_NOTE,
  similarityText,
  STATES_COMPARE_INTRO,
  STATES_COMPARE_MAX,
  STATES_COMPARE_MIN,
  STATES_COMPARE_SUMMARY_NOTE,
  statesCompareAllLabel,
  statesCompareCaption,
  statesCompareCsvPath,
  statesCompareGroupCountText,
  statesCompareNames,
  statesCompareNoListText,
  statesCompareOnlyLabel,
  statesComparePath,
  type StatesCompareQuery,
  type StatesCompareResponse,
  statesCompareSearchParams,
  statesCompareSummaryText,
  statesCompareTitle,
  STATES_LANDING_DESCRIPTION,
  STATES_LANDING_HEADING,
  STATES_LANDING_INTRO,
  STATES_LANDING_OWN_HEADING,
  STATES_LANDING_OWN_LABEL,
  STATES_LANDING_PICK_HEADING,
  TILE_MAP_HEADING,
  TILE_MAP_INTRO,
  TILE_MAP_NOT_REVIEWED_NOTE,
  tileMapCaption,
  tileMapCategory,
  tileMapTiles,
} from '@mfcd/shared'

import { Html, html, jsonLdScript } from './html'

// The content of each public page as plain semantic HTML, for crawlers that do not run
// JavaScript (docs/seo.md). Vue replaces it when it mounts. Wording and numbers come from the
// same shared helpers as the Vue pages, so both say the same thing.

export interface PageParts {
  status: 200 | 404
  /** The page's path, to mark the current link in the navigation. */
  path: string
  title: string
  description: string
  /** Absolute URL. */
  canonical: string
  noindex: boolean
  jsonLd: unknown[]
  body: Html
}

const HOME_DESCRIPTION =
  'Compare the code lists US states use to mark Medicaid members as medically frail, the ' +
  'exemption from the H.R.1 work requirements.'

export const downloadName = (slug: string, versionNo: number, ext: 'csv' | 'json') =>
  `${slug}-medical-frailty-codes-v${String(versionNo)}.${ext}`

/** Every state with its status, entries and date: the home page and `/states`. */
function stateListTable(items: readonly PublicStateSummary[]): Html {
  return html`<table>
    <caption>
      State frailty code lists
    </caption>
    <thead>
      <tr>
        <th scope="col">State</th>
        <th scope="col">Status</th>
        <th scope="col">Entries</th>
        <th scope="col">State list dated</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(
        (s) =>
          html`<tr>
            <th scope="row"><a href="/states/${s.slug}">${s.name}</a></th>
            <td>${stateStatusLabels[s.status]}</td>
            <td>${s.published ? formatCount(s.published.totalEntries) : ''}</td>
            <td>${s.published?.sourceDate ? formatDay(s.published.sourceDate) : ''}</td>
          </tr>`,
      )}
    </tbody>
  </table>`
}

export function statesPage(items: readonly PublicStateSummary[], origin: string): PageParts {
  const withList = items.filter((s) => s.published !== null).length
  return {
    status: 200,
    title: pageTitles.states,
    description: `Every US state and DC: whether each has published a Medicaid medically frail code list, how many entries it has, and when the state dated it.`,
    path: '/states',
    canonical: `${origin}/states`,
    noindex: false,
    jsonLd: [],
    body: html`<h1>All states</h1>
      <p>
        ${withList} of ${STATES_AND_DC} states and DC have a list on this site. Choose a state to
        see its list, sources and history.
      </p>
      ${stateListTable(items)}`,
  }
}

/**
 * "One category across the country" (roadmap M5 step 8) for crawlers, on the home page and the
 * Map tab (`/compare/map`): the category in the URL (the first by default) as a plain table of
 * every state and DC by name, not the visual grid, and the picker as a GET form to `action`.
 * Nothing when no category is published.
 */
function tileMapTable(
  overview: PublicOverviewResponse,
  query: Readonly<Record<string, string>>,
  action: string,
): Html | null {
  const category = tileMapCategory(overview.categories, query)
  if (!category) return null
  const tiles = tileMapTiles(overview, category)
  return html`<form method="get" action="${action}">
      <p>
        <label for="tile-category">Category</label>
        <select id="tile-category" name="category">
          ${overviewCategoryGroups(overview.categories).map(
            (g) =>
              html`<optgroup label="${g.label}">
                ${g.categories.map((c) =>
                  c.id === category.id
                    ? html`<option value="${c.slug}" selected>${c.label}</option>`
                    : html`<option value="${c.slug}">${c.label}</option>`,
                )}
              </optgroup>`,
          )}
        </select>
        <button type="submit">Show</button>
      </p>
    </form>
    <table>
      <caption>
        ${tileMapCaption(category)}
      </caption>
      <thead>
        <tr>
          <th scope="col">State</th>
          <th scope="col">${category.label}</th>
        </tr>
      </thead>
      <tbody>
        ${tiles.map((t) => {
          const value = t.href ? html`<a href="${t.href}">${t.tableText}</a>` : t.tableText
          const note = t.notReviewed ? ` (${OVERVIEW_NOT_REVIEWED})` : ''
          return html`<tr>
            <th scope="row"><a href="/states/${t.slug}">${t.name}</a></th>
            <td>${value}${note}</td>
          </tr>`
        })}
      </tbody>
    </table>
    ${tiles.some((t) => t.notReviewed) ? html`<p>${TILE_MAP_NOT_REVIEWED_NOTE}</p>` : null}`
}

/** The home page's tile map section; nothing when no category is published. */
function tileMapSection(
  overview: PublicOverviewResponse,
  query: Readonly<Record<string, string>>,
): Html | null {
  const table = tileMapTable(overview, query, '/')
  if (!table) return null
  return html`<h2>${TILE_MAP_HEADING}</h2>
    <p>${TILE_MAP_INTRO}</p>
    ${table}`
}

/**
 * `/compare/map`, the Map tab: the home page's tile map as a page of its own. Indexed, canonical
 * to the bare page, like the home page whose `?category=` it shares.
 */
export function mapPage(
  overview: PublicOverviewResponse,
  origin: string,
  query: Readonly<Record<string, string>> = {},
): PageParts {
  const path = '/compare/map'
  return {
    status: 200,
    title: pageTitles.map,
    description: MAP_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: false,
    jsonLd: [],
    body: html`<h1>${TILE_MAP_HEADING}</h1>
      ${compareTabsHtml(path)}
      <p>${TILE_MAP_INTRO}</p>
      ${tileMapTable(overview, query, path) ?? html`<p>No categories are published yet.</p>`}`,
  }
}

/**
 * `/compare/categories`, the Categories tab: every published unified category under its federal
 * category, each linking to its page, with its definition. Indexed and in the sitemap.
 */
export function categoriesPage(overview: PublicOverviewResponse, origin: string): PageParts {
  const path = '/compare/categories'
  const groups = overviewCategoryGroups(overview.categories)
  return {
    status: 200,
    title: pageTitles.categories,
    description: CATEGORIES_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: false,
    jsonLd: [],
    body: html`<h1>${CATEGORIES_HEADING}</h1>
      ${compareTabsHtml(path)}
      <p>${CATEGORIES_INTRO}</p>
      ${
        groups.length === 0
          ? html`<p>No categories are published yet.</p>`
          : groups.map(
              (g) =>
                html`<h2>${g.label}</h2>
                  <ul>
                    ${g.categories.map(
                      (c) =>
                        html`<li>
                          <a href="/compare/${c.slug}">${c.label}</a>
                          ${c.definition ? html`<p>${c.definition}</p>` : null}
                        </li>`,
                    )}
                  </ul>`,
            )
      }`,
  }
}

export function homePage(
  items: readonly PublicStateSummary[],
  origin: string,
  overview: PublicOverviewResponse | null = null,
  query: Readonly<Record<string, string>> = {},
): PageParts {
  const withList = items.filter((s) => s.published !== null).length
  const url = `${origin}/`
  return {
    status: 200,
    title: pageTitles.home,
    description: HOME_DESCRIPTION,
    path: '/',
    canonical: url,
    noindex: false,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url,
        description: HOME_DESCRIPTION,
      },
    ],
    body: html`<h1>Compare medical frailty codes by state</h1>
      <p>
        Under H.R.1, Medicaid members who are medically frail are exempt from work requirements.
        Each state publishes its own list of diagnosis and service codes for frailty. This site puts
        those lists side by side.
      </p>
      <h2>States</h2>
      <p>${withList} of ${STATES_AND_DC} states and DC have a list on this site.</p>
      ${stateListTable(items)} ${overview ? tileMapSection(overview, query) : null}`,
  }
}

function countTable<K extends string>(
  caption: string,
  counts: Record<K, number>,
  label: (key: K) => string,
): Html {
  const rows = (Object.entries(counts) as [K, number][]).filter(([, n]) => n > 0)
  return html`<table>
    <caption>
      ${caption}
    </caption>
    <tbody>
      ${rows.map(
        ([key, n]) =>
          html`<tr>
            <th scope="row">${label(key)}</th>
            <td>${formatCount(n)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`
}

function categoryName(category: string, subcategory: string) {
  if (category === '' && subcategory === '') return '(no category)'
  return subcategory === '' ? category : `${category} › ${subcategory}`
}

/** The answer in plain sentences, near the top (docs/seo.md, "Facts that AI can quote"). */
function summarySentences(detail: PublicStateDetail): string[] {
  const { state } = detail
  const p = state.published
  if (!p) {
    return [
      state.status === 'announced'
        ? `${state.name} has announced a list of medical frailty codes. It is not on this site yet.`
        : `${state.name} has not published a list of medical frailty codes that we know of.`,
    ]
  }
  const dated = p.sourceDate
    ? `from the state’s list dated ${formatDay(p.sourceDate)}`
    : 'from a state list that gives no date'
  const sentences = [
    `${state.name}’s medical frailty code list on this site has ${formatCount(p.totalEntries)} entries (version ${String(p.versionNo)}), ${dated}.`,
  ]
  const byRule = (Object.entries(p.byQualification) as [Qualification, number][])
    .filter(([, n]) => n > 0)
    .map(([q, n]) => `${qualificationLabels[q]}, ${formatCount(n)}`)
  if (byRule.length > 0) sentences.push(`Entries by the state’s rules: ${byRule.join('; ')}.`)
  if (p.updatedAt) sentences.push(`Last updated on this site ${formatDay(p.updatedAt)}.`)
  return sentences
}

export function statePage(detail: PublicStateDetail, origin: string): PageParts {
  const { state } = detail
  const p = state.published
  const url = `${origin}/states/${state.slug}`
  const sentences = summarySentences(detail)
  const description = p
    ? `${state.name}’s Medicaid medically frail code list: ${formatCount(p.totalEntries)} entries` +
      `${p.sourceDate ? `, state list dated ${formatDay(p.sourceDate)}` : ''}. Counts by code ` +
      'system and federal category, sources, version history and downloads.'
    : sentences.join(' ')

  const jsonLd: unknown[] = []
  if (p) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${state.name} medical frailty codes`,
      description,
      url,
      creator: { '@type': 'Organization', name: SITE_NAME },
      isBasedOn: detail.sources.flatMap((s) => (s.url ? [s.url] : [])),
      citation: detail.sources.map((s) => s.title),
      ...(p.updatedAt ? { dateModified: p.updatedAt } : {}),
      ...(p.sourceDate ? { temporalCoverage: `${p.sourceDate}/..` } : {}),
      spatialCoverage: { '@type': 'State', name: state.name },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: `${url}/codes.csv`,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${url}/codes.json`,
        },
      ],
    })
  }

  const notes = detail.notesMd
    ? html`<h2>Notes</h2>
        ${detail.notesMd.split(/\n\s*\n/).map((para) => html`<p>${para.trim()}</p>`)}`
    : null

  const listed = p
    ? html`<h2>What the list contains</h2>
        <p>
          An entry is one line of the state’s list: a single code, or a group of codes written with
          a wildcard or a range.
        </p>
        ${countTable('Entries by code system', p.bySystem, (k: CodeSystem) => codeSystemLabels[k])}
        ${countTable('Entries by federal category', p.byFederalCategory, (k: FederalCategory) => federalCategoryInfo[k].label)}
        ${federalCountsOverlap(p) ? html`<p>${FEDERAL_OVERLAP_NOTE}</p>` : null}
        ${countTable('Entries by whether a code qualifies alone', p.byQualification, (k: Qualification) => qualificationLabels[k])}
        <h2>Categories</h2>
        <p>${stateCategoriesIntro(state.name)}</p>
        <table>
          <caption>
            ${state.name}’s categories
          </caption>
          <thead>
            <tr>
              <th scope="col">State category</th>
              <th scope="col">Federal category</th>
              <th scope="col">Entries</th>
              <th scope="col">Mapping</th>
            </tr>
          </thead>
          <tbody>
            ${detail.categories.map(
              (c) =>
                html`<tr>
                  <th scope="row">${categoryName(c.stateCategory, c.stateSubcategory)}</th>
                  <td>${federalCategoryInfo[c.federalCategory].label}</td>
                  <td>${formatCount(c.entries)}</td>
                  <td>${c.confirmed ? 'Confirmed' : 'Not yet confirmed'}</td>
                </tr>`,
            )}
          </tbody>
        </table>
        ${similarSection(state, detail.similar)}
        <h2>Sources</h2>
        <ul>
          ${detail.sources.map(
            (s) =>
              html`<li>
                ${s.url ? html`<a href="${s.url}" rel="noopener noreferrer external">${s.title}</a>` : `${s.title} (link not known)`}
                ·
                ${s.fileType.toUpperCase()}${s.publisherDate ? ` · dated ${formatDay(s.publisherDate)}` : ''}
                · retrieved ${formatDay(s.retrievedAt)}
              </li>`,
          )}
        </ul>
        <h2>Downloads</h2>
        <ul>
          <li><a href="/states/${state.slug}/codes.csv">${state.name} codes (CSV)</a></li>
          <li><a href="/states/${state.slug}/codes.json">${state.name} codes (JSON)</a></li>
        </ul>
        <h2>Version history</h2>
        <table>
          <caption>
            Version history
          </caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Published here</th>
              <th scope="col">Entries</th>
            </tr>
          </thead>
          <tbody>
            ${detail.versions.map(
              (v) =>
                html`<tr>
                  <th scope="row">${v.versionNo}</th>
                  <td>${v.status === 'published' ? 'Current' : 'Replaced'}</td>
                  <td>${v.publishedAt ? formatDay(v.publishedAt) : ''}</td>
                  <td>${formatCount(v.rowCount)}</td>
                </tr>`,
            )}
          </tbody>
        </table>`
    : null

  return {
    status: 200,
    title: pageTitles.state(state.name),
    description,
    path: `/states/${state.slug}`,
    canonical: url,
    noindex: false,
    jsonLd,
    body: html`<p><a href="/states">All states</a></p>
      <h1>${state.name}</h1>
      ${sentences.map((s) => html`<p>${s}</p>`)} ${listed} ${notes}`,
  }
}

/**
 * "States with the most similar lists" (roadmap M5 step 7): each with its similarity and a link
 * to the pair, and a GET form that works without JavaScript (`/compare/states?states=…`
 * redirects to the comparison).
 */
function similarSection(
  state: { id: string; slug: string; name: string },
  similar: readonly SimilarState[],
): Html {
  return html`<h2>States with the most similar lists</h2>
    <p>${SIMILARITY_NOTE}</p>
    ${
      similar.length === 0
        ? html`<p>No other state has a list to compare with yet.</p>`
        : html`<form method="get" action="/compare/states">
            <input type="hidden" name="states" value="${state.slug}" />
            <ul>
              ${similar.map(
                (s) =>
                  html`<li>
                    <input type="checkbox" name="states" value="${s.slug}" id="similar-${s.slug}" />
                    <label for="similar-${s.slug}">${s.name}</label>
                    Similarity ${similarityText(s.jaccard)} ·
                    <a href="${statesComparePath([state.id, s.id])}">Compare with ${s.name}</a>
                  </li>`,
              )}
            </ul>
            <p>
              <button type="submit">Compare ${state.name} with the chosen states</button>
              Choose up to ${SIMILAR_PICK_MAX}.
            </p>
          </form>`
    }`
}

const COMPARE_DESCRIPTION =
  'Compare the medical frailty codes of any number of states, one category at a time: which ' +
  'codes each state lists, covers with a wildcard or range, or leaves out.'

/** `/compare/codes.csv?…` for a selection: every row, so no page. */
export const compareCsvPath = (query: CompareQuery) =>
  `/compare/codes.csv?${compareSearchParams({ ...query, page: 1 }).toString()}`

/**
 * `/compare/codes`: never indexed (each combination is a view of facts whose home is the state
 * page), canonical to the bare `/compare/codes`. Renders the table for the selection in the
 * URL, if any.
 */
export function comparePage(
  origin: string,
  view: { query: CompareQuery; result: CompareResult } | { error: string } | null,
): PageParts {
  const intro = html`<h1>Compare states by category</h1>
    ${compareTabsHtml('/compare/codes')}
    <p>
      Pick a category and the states to compare. Each row is a code, a wildcard or a range that at
      least one of them lists in that category; each column shows what that state’s whole list says
      about it.
    </p>`
  let body: Html
  if (view === null) {
    body = html`${intro}
      <p>Pick a category and at least one state to see the table.</p>`
  } else if ('error' in view) {
    body = html`${intro}
      <p>${view.error}</p>`
  } else {
    const { query, result } = view
    const names = new Map(result.states.map((s) => [s.id, s.name]))
    const subject = compareSubject(query, (id) => names.get(id) ?? id)
    body = html`${intro}
      <h2>${subject}: codes by state</h2>
      <p>
        ${formatCount(result.totalRows)} codes, page ${result.page} of ${result.pageCount}.
        <a href="${compareCsvPath(query)}">Download all rows (CSV)</a>
      </p>
      <table>
        <caption>
          ${subject}: codes by state
        </caption>
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Description</th>
            ${result.states.map((s) => html`<th scope="col"><a href="/states/${s.slug}">${s.name}</a></th>`)}
          </tr>
        </thead>
        <tbody>
          ${result.rows.map(
            (row) =>
              html`<tr>
                <th scope="row">${row.display}</th>
                <td>${row.description ?? ''}</td>
                ${row.cells.map((cell, i) => {
                  const stateId = result.states[i]?.id ?? ''
                  const m = cell.match
                  const filed = m ? compareFiledUnder(query, stateId, m) : null
                  const text = [
                    compareCellText(cell),
                    m?.tier,
                    m ? compareQualificationText(m) : null,
                    filed ? `filed under ${filed}` : null,
                  ]
                    .filter((part) => part !== null && part !== undefined && part !== '')
                    .join('; ')
                  return html`<td>${text}</td>`
                })}
              </tr>`,
          )}
        </tbody>
      </table>`
  }
  return {
    status: 200,
    title: pageTitles.compare,
    description: COMPARE_DESCRIPTION,
    path: '/compare/codes',
    canonical: `${origin}/compare/codes`,
    noindex: true,
    jsonLd: [],
    body,
  }
}

/**
 * `/compare`: the overview matrix (roadmap M5 step 5), every state against every published
 * unified category. Indexed: it is the one page that answers "which states cover what".
 */
export function overviewPage(
  data: PublicOverviewResponse,
  origin: string,
  query: Readonly<Record<string, string>> = {},
): PageParts {
  const { categories } = data
  const groups = overviewCategoryGroups(categories)
  // The order a shared link asks for (`?order=`, `?sort=&dir=`), as the Vue page reads it.
  const order = overviewOrderFromQuery(query, categories)
  const rows = orderOverviewStates(data.states, order)
  /** A column header's opening tag, with `aria-sort` when the rows are sorted by it. */
  const headerOpen = (column: 'overall' | number, attributes: string) => {
    const active =
      column === 'overall'
        ? order.by === 'overall'
        : order.by === 'category' && order.unifiedId === column
    const sort =
      active && 'dir' in order
        ? ` aria-sort="${order.dir === 'desc' ? 'descending' : 'ascending'}"`
        : ''
    return new Html(`<th ${attributes}${sort}>`)
  }

  /** A column's label; † marks a category without a full code list. */
  const headerLabel = (c: PublicOverviewResponse['categories'][number]) =>
    c.coverageBasis === 'union' ? `${c.label} †` : c.label

  const intro = html`<h1>Which states cover what</h1>
    ${compareTabsHtml('/compare')}
    <p>
      Each row is a state; each column is a category, grouped under its federal category in the law.
      A number is the share of the category’s codes that the state lists. Select a number to see the
      category’s codes with that state in focus.
    </p>`
  const table =
    categories.length === 0
      ? html`<p>No categories are published yet.</p>`
      : html`<table>
          <caption>
            Share of each category’s codes that each state lists
          </caption>
          <thead>
            <tr>
              <th scope="col" rowspan="2">State</th>
              ${groups.map(
                (g) => html`<th scope="colgroup" colspan="${g.categories.length}">${g.label}</th>`,
              )}
              ${headerOpen('overall', 'scope="col" rowspan="2"')}Overall</th>
            </tr>
            <tr>
              ${categories.map(
                (c) =>
                  html`${headerOpen(c.id, 'scope="col"')}
                    <a href="/compare/${c.slug}">${headerLabel(c)}</a>
                  </th>`,
              )}
            </tr>
          </thead>
          <tbody>
            ${rows.map((s) => {
              const head = html`<th scope="row"><a href="/states/${s.slug}">${s.name}</a></th>`
              if (!s.hasList) {
                return html`<tr>
                  ${head}
                  <td colspan="${categories.length + 1}">${OVERVIEW_NO_LIST}</td>
                </tr>`
              }
              return html`<tr>
                ${head}
                ${categories.map((c, i) => {
                  const cell = s.cells[i]
                  if (!cell) return html`<td></td>`
                  const note = overviewCellNotReviewed(cell) ? ` (${OVERVIEW_NOT_REVIEWED})` : ''
                  const href = overviewDrillDownPath(c.slug, s.id)
                  const link = html`<a href="${href}">${overviewCellText(cell.share)}</a>`
                  return html`<td>${link}${note}</td>`
                })}
                <td>${overviewCellText(overviewOverall(s))}</td>
              </tr>`
            })}
          </tbody>
        </table>`
  return {
    status: 200,
    title: pageTitles.overview,
    description: OVERVIEW_DESCRIPTION,
    path: '/compare',
    canonical: `${origin}/compare`,
    noindex: false,
    jsonLd: [],
    body: html`${intro} ${table}
      <h2>Reading this table</h2>
      ${overviewReadingNotes.map((p) => html`<p>${p}</p>`)}
      <p>
        Shades:
        ${(['high', 'mid', 'low', 'none'] as const).map((b) => coverageBandLabels[b]).join('; ')}.
      </p>`,
  }
}

/** A drill-down cell in words: status, tier, rule and the state's own category. */
export function drillCellWords(cell: DrillCell): string {
  const m = cell.match
  const filed = m ? drillFiledUnder(m) : null
  return [
    compareCellText(cell),
    m?.tier,
    m ? compareQualificationText(m) : null,
    filed ? `filed under ${filed}` : null,
  ]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join('; ')
}

/** The row's description, with the state named when the text is the state's own. */
const drillDescription = (r: Pick<DrillRow, 'description' | 'descriptionSource'>): string =>
  r.description === null
    ? ''
    : r.descriptionSource && r.descriptionSource !== 'cms'
      ? `${r.description} (${r.descriptionSource}’s text)`
      : r.description

/** A link to the same view with some options changed (`?…`, relative to the page). */
function drillHref(query: DrillQuery, change: Partial<DrillQuery>, hash = ''): string {
  const search = drillSearchParams({ ...query, ...change }).toString()
  return `${search === '' ? '?' : `?${search}`}${hash}`
}

/** The details of one row: every state's cell; states without one as abbreviations. */
function drillDetailHtml(detail: DrillDetailResponse): Html {
  const { row } = detail
  const shown = detail.states.filter((s) => s.hasList && s.cell.status !== 'not_listed')
  const notListed = detail.states.filter((s) => s.hasList && s.cell.status === 'not_listed')
  const noList = detail.states.filter((s) => !s.hasList)
  const abbreviations = (label: string, list: typeof noList) =>
    list.length === 0
      ? null
      : html`<p>${label} (${list.length}): ${list.map((s) => s.id).join(' ')}</p>`
  return html`<section id="code-details" aria-labelledby="code-details-heading">
    <h2 id="code-details-heading">${row.display}${row.description ? ` ${row.description}` : ''}</h2>
    <p>Listed by ${drillCountText(row.count, detail.statesWithList)} with lists.</p>
    ${
      shown.length === 0
        ? null
        : html`<table>
            <caption>
              ${row.display}: each state’s rule
            </caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">How the state lists it</th>
              </tr>
            </thead>
            <tbody>
              ${shown.map(
                (s) =>
                  html`<tr>
                    <th scope="row">${s.name}</th>
                    <td>${drillCellWords(s.cell)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>`
    }
    ${abbreviations('Not listed', notListed)} ${abbreviations('No list on this site', noList)}
  </section>`
}

/**
 * `/compare/<slug>` (roadmap M5 step 6): one published unified category's codes, ranked by how
 * many states list them, every group expanded. The bare page is indexed; any query (filters,
 * focus, details, page) is a view of it: `noindex`, canonical to the bare page.
 */
export function drillPage(
  data: DrillResponse,
  query: DrillQuery,
  detail: DrillDetailResponse | null,
  origin: string,
  hasQuery: boolean,
): PageParts {
  const { category } = data
  const path = `/compare/${category.slug}`
  const focusState = data.states.find((s) => s.id === data.query.focus) ?? null
  const applied: DrillQuery = { ...query, ...data.query, page: data.page }
  const caption = `${category.label}: codes by how many states list them`
  const total = data.states.length

  const about = html`<h1>${category.label}</h1>
    ${compareTabsHtml(path)}
    <p>Federal category: ${federalCategoryInfo[category.federalCategory].label}.</p>
    <p>${category.definition}</p>
    ${category.includes ? html`<p>Includes: ${category.includes}</p>` : null}
    ${category.excludes ? html`<p>Excludes: ${category.excludes}</p>` : null}
    ${
      category.ccsr.length === 0
        ? null
        : html`<h2>CCSR groups</h2>
            <ul>
              ${category.ccsr.map((g) => html`<li>${g.id}: ${g.description}</li>`)}
            </ul>
            <p>Source: ${CCSR_CITATION}</p>`
    }`

  const form = html`<form method="get" action="${path}">
    <p>
      <label for="drill-focus">Focus state</label>
      <select id="drill-focus" name="focus">
        <option value="">None</option>
        ${data.states.map((s) =>
          s.id === data.query.focus
            ? html`<option value="${s.id}" selected>${s.name}</option>`
            : html`<option value="${s.id}">${s.name}</option>`,
        )}
      </select>
    </p>
    <fieldset>
      <legend>Show</legend>
      ${drillShows.map(
        (v) =>
          html`<label
            ><input
              type="radio"
              name="show"
              value="${v}"
              ${new Html(v === data.query.show ? 'checked' : '')}
            />
            ${drillShowLabels[v]}</label
          >`,
      )}
    </fieldset>
    ${
      data.systems.length > 1
        ? html`<p>
            <label for="drill-system">Code system</label>
            <select id="drill-system" name="system">
              <option value="">All</option>
              ${data.systems.map((sys) =>
                sys === data.query.system
                  ? html`<option value="${sys}" selected>${codeSystemLabels[sys]}</option>`
                  : html`<option value="${sys}">${codeSystemLabels[sys]}</option>`,
              )}
            </select>
          </p>`
        : null
    }
    <p>
      <label
        ><input
          type="checkbox"
          name="all"
          value="1"
          ${new Html(
            [category.universeSize === 0 ? 'disabled' : '', data.query.all ? 'checked' : '']
              .filter((a) => a !== '')
              .join(' '),
          )}
        />
        Include codes no state lists</label
      >
      ${drillUniverseNote(category.universeSize)}
    </p>
    <p><button type="submit">Apply</button></p>
  </form>`

  const links = html`<p>
    <a href="${drillCsvPath(category.slug, applied)}">Download every row (CSV)</a>.
    <a
      href="${drillCodeTablePath(
        category.federalCategory,
        data.states.map((s) => s.id),
      )}"
      >Compare single codes in ${federalCategoryInfo[category.federalCategory].label}</a
    >.
  </p>`

  const columns = focusState ? 5 : 4
  const table =
    data.groups.length === 0
      ? html`<p>No codes match this filter.</p>`
      : html`<table>
          <caption>
            ${caption}
          </caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Description</th>
              <th scope="col">States listing it</th>
              <th scope="col">Their rules</th>
              ${focusState ? html`<th scope="col">${focusState.name}</th>` : null}
              <th scope="col">Details</th>
            </tr>
          </thead>
          ${data.groups.map(
            (g) =>
              html`<tbody>
                <tr>
                  <th scope="rowgroup">${g.label}</th>
                  <td>${g.description ?? ''}</td>
                  <td>${drillGroupCountText(g.anyCount, total)}</td>
                  <td colspan="${columns - 2}">
                    ${g.rowCount} ${g.rowCount === 1 ? 'code' : 'codes'}
                  </td>
                </tr>
                ${g.rows.map(
                  (r) =>
                    html`<tr>
                      <th scope="row">${r.display}</th>
                      <td>${drillDescription(r)}</td>
                      <td>${drillCountText(r.count, total)}</td>
                      <td>${drillRulesText(r.rules)}</td>
                      ${r.focus ? html`<td>${drillCellWords(r.focus)}</td>` : null}
                      <td>
                        <a href="${drillHref(applied, { code: r.key }, '#code-details')}"
                          >Details</a
                        >
                      </td>
                    </tr>`,
                )}
              </tbody>`,
          )}
        </table>`

  const pager =
    data.pageCount > 1
      ? html`<nav aria-label="Pages">
          <p>
            ${
              data.page > 1
                ? html`<a href="${drillHref(applied, { page: data.page - 1, code: null })}"
                    >Previous page</a
                  >`
                : null
            }
            ${
              data.page < data.pageCount
                ? html`<a href="${drillHref(applied, { page: data.page + 1, code: null })}"
                    >Next page</a
                  >`
                : null
            }
          </p>
        </nav>`
      : null

  return {
    status: 200,
    title: pageTitles.drillDown(category.label),
    description:
      category.definition.length > 300
        ? `${category.definition.slice(0, 297)}…`
        : category.definition,
    path,
    canonical: `${origin}${path}`,
    noindex: hasQuery,
    jsonLd: [],
    body: html`${about} ${form}
      <p>${drillStatusText(data)}</p>
      ${links} ${table} ${pager} ${detail ? drillDetailHtml(detail) : null}`,
  }
}

/** The comparison's pickers as a GET form (`/compare/states?states=…` redirects). */
function statesPickerForm(
  choices: readonly { slug: string; name: string }[],
  currentSlugs: readonly string[] = [],
): Html {
  const labels = ['First state', 'Second state', 'Third state', 'Fourth state']
  return html`<form method="get" action="/compare/states">
    <fieldset>
      <legend>States to compare</legend>
      ${labels.slice(0, STATES_COMPARE_MAX).map((label, i) => {
        const current = currentSlugs[i]
        return html`<p>
          <label for="states-picker-${i}">${label}</label>
          <select id="states-picker-${i}" name="states">
            <option value="">${i < STATES_COMPARE_MIN ? 'Choose a state' : 'None'}</option>
            ${choices.map((c) =>
              c.slug === current
                ? html`<option value="${c.slug}" selected>${c.name}</option>`
                : html`<option value="${c.slug}">${c.name}</option>`,
            )}
          </select>
        </p>`
      })}
    </fieldset>
    <p><button type="submit">Compare</button></p>
  </form>`
}

/**
 * `/compare/states/<st>-vs-<st>…` (roadmap M5 step 7): the summary and the codes where the
 * states differ, every group expanded. Never indexed (1,275 pairs alone would be thin,
 * near-duplicate pages; the state pages carry the similarity in text); canonical to the states
 * in alphabetical order, since the order only changes the columns.
 */
export function statesComparePage(
  data: StatesCompareResponse,
  query: StatesCompareQuery,
  origin: string,
  path: string,
): PageParts {
  const names = data.states.map((s) => s.name)
  const sorted = [...data.states.map((s) => s.id)].sort()
  const applied: StatesCompareQuery = { ...query, diff: data.query.diff, page: data.page }
  const href = (change: Partial<StatesCompareQuery>) =>
    `?${statesCompareSearchParams({ ...applied, page: 1, ...change }).toString()}`
  const noList = data.states.filter((s) => !s.hasList)
  const summary = data.summary
  const description = summary
    ? `Where ${names.join(' and ')}’s medical frailty code lists differ: ${data.states
        .map((s, i) => `${String(summary.only[i] ?? 0)} codes only ${s.name} lists`)
        .join(
          ', ',
        )}, ${String(summary.all)} listed by ${data.states.length === 2 ? 'both' : 'all'}.`
    : statesCompareNoListText(noList.map((s) => s.name))

  const head = html`<h1>${statesCompareNames(names)}</h1>
    ${compareTabsHtml(path)}
    <p>${STATES_COMPARE_INTRO}</p>
    ${statesPickerForm(
      data.choices,
      data.states.map((s) => s.slug),
    )}`

  if (!summary) {
    return {
      status: 200,
      title: statesCompareTitle(names),
      description,
      path,
      canonical: `${origin}${statesComparePath(sorted)}`,
      noindex: true,
      jsonLd: [],
      body: html`${head}
        <p>
          ${description}
          ${noList.map((s) => html`<a href="/states/${s.slug}">${s.name}’s page</a>. `)}
        </p>`,
    }
  }

  const summaryHtml = html`<h2>Summary</h2>
    <dl>
      ${data.states.map(
        (s, i) =>
          html`<dt>${statesCompareOnlyLabel(s.name)}</dt>
            <dd>${formatCount(summary.only[i] ?? 0)}</dd>`,
      )}
      <dt>${statesCompareAllLabel(data.states.length)}</dt>
      <dd>${formatCount(summary.all)}</dd>
      ${
        summary.similarity
          ? html`<dt>Similarity</dt>
              <dd>${similarityText(summary.similarity.jaccard)}</dd>`
          : null
      }
    </dl>
    <p>${STATES_COMPARE_SUMMARY_NOTE} ${summary.similarity ? SIMILARITY_NOTE : ''}</p>`

  const links = html`<p>
    ${
      data.query.diff
        ? html`<a href="${href({ diff: false })}">Show every code</a>`
        : html`<a href="${href({ diff: true })}">Show only differences</a>`
    }.
    <a href="${statesCompareCsvPath(data.states.map((s) => s.id))}">Download every code (CSV)</a>.
  </p>`

  const groupHeading = (g: StatesCompareResponse['groups'][number]) => {
    const differ = `${String(g.differing)} of ${String(g.allRows)} ${g.allRows === 1 ? 'code differs' : 'codes differ'}${g.continued ? ', continued' : ''}`
    return g.slug
      ? html`<a href="/compare/${g.slug}">${g.label}</a> (${differ})`
      : html`${g.label} (${differ})`
  }
  const rowHeading = (r: StatesCompareResponse['groups'][number]['rows'][number]) =>
    `${r.display}${!data.query.diff && r.differs ? ' (differs)' : ''}`

  const table =
    data.groups.length === 0
      ? html`<p>These lists do not differ.</p>`
      : html`<table>
          <caption>
            ${statesCompareCaption(names, data.query.diff)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Description</th>
              ${data.states.map((s) => html`<th scope="col">${s.name}</th>`)}
            </tr>
          </thead>
          ${data.groups.map(
            (g) =>
              html`<tbody>
                <tr>
                  <th scope="rowgroup" colspan="2">${groupHeading(g)}</th>
                  ${g.counts.map((n) => html`<td>${statesCompareGroupCountText(n)}</td>`)}
                </tr>
                ${g.rows.map(
                  (r) =>
                    html`<tr>
                      <th scope="row">${rowHeading(r)}</th>
                      <td>${drillDescription(r)}</td>
                      ${r.cells.map((cell) => html`<td>${drillCellWords(cell)}</td>`)}
                    </tr>`,
                )}
              </tbody>`,
          )}
        </table>`

  const pager =
    data.pageCount > 1
      ? html`<nav aria-label="Pages">
          <p>
            ${data.page > 1 ? html`<a href="${href({ page: data.page - 1 })}">Previous page</a>` : null}
            ${
              data.page < data.pageCount
                ? html`<a href="${href({ page: data.page + 1 })}">Next page</a>`
                : null
            }
          </p>
        </nav>`
      : null

  return {
    status: 200,
    title: statesCompareTitle(names),
    description,
    path,
    canonical: `${origin}${statesComparePath(sorted)}`,
    noindex: true,
    jsonLd: [],
    body: html`${head} ${summaryHtml} ${links}
      <p>
        ${statesCompareSummaryText({
          totalRows: data.totalRows,
          totalGroups: data.totalGroups,
          page: data.page,
          pageCount: data.pageCount,
          diff: data.query.diff,
        })}
      </p>
      ${table} ${pager}`,
  }
}

export function statesCompareNotFoundPage(
  origin: string,
  path: string,
  reason = 'There is no comparison at this address.',
): PageParts {
  return {
    status: 404,
    title: pageTitles.statesCompareNotFound,
    description: 'A comparison names 2 to 4 states with a list.',
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>Comparison not found</h1>
      ${compareTabsHtml(path)}
      <p>
        ${reason} A comparison names 2 to 4 states with a list, like
        <a href="/compare/states/ga-vs-ne">/compare/states/ga-vs-ne</a>.
        <a href="/compare/states">Choose states to compare</a>
      </p>`,
  }
}

/**
 * `/compare/states`, the States side by side tab: "Your state" as a GET form (`?state=ga`
 * shows its most similar states, the state page's section) and the comparison's pickers as a
 * GET form (`?states=…` redirects to the comparison). Never indexed, like the comparisons: it
 * holds no facts of its own, and `?state=` repeats the state page's (docs/seo.md).
 */
export function statesLandingPage(
  items: readonly PublicStateSummary[],
  own: PublicStateDetail | null,
  origin: string,
): PageParts {
  const path = '/compare/states'
  const choices = items.filter((s) => s.published !== null)
  const ownSlug = own?.state.published ? own.state.slug : null
  const ownForm = html`<form method="get" action="${path}">
    <p>
      <label for="own-state">${STATES_LANDING_OWN_LABEL}</label>
      <select id="own-state" name="state">
        <option value="">Choose a state</option>
        ${choices.map((s) =>
          s.slug === ownSlug
            ? html`<option value="${s.slug}" selected>${s.name}</option>`
            : html`<option value="${s.slug}">${s.name}</option>`,
        )}
      </select>
      <button type="submit">Show similar states</button>
    </p>
  </form>`
  const pickers =
    choices.length < STATES_COMPARE_MIN
      ? html`<p>Fewer than 2 states have a list on this site yet.</p>`
      : html`<h2>${STATES_LANDING_OWN_HEADING}</h2>
          ${ownForm} ${own && ownSlug ? similarSection(own.state, own.similar) : null}
          <h2>${STATES_LANDING_PICK_HEADING}</h2>
          ${statesPickerForm(choices)}`
  return {
    status: 200,
    title: pageTitles.statesLanding,
    description: STATES_LANDING_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>${STATES_LANDING_HEADING}</h1>
      ${compareTabsHtml(path)}
      <p>${STATES_LANDING_INTRO}</p>
      ${pickers}`,
  }
}

export function categoryNotFoundPage(origin: string, path: string): PageParts {
  return {
    status: 404,
    title: pageTitles.categoryNotFound,
    description: 'There is no published category at this address.',
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>Category not found</h1>
      ${compareTabsHtml(path)}
      <p>
        There is no published category at this address.
        <a href="/compare/categories">See every category</a>
      </p>`,
  }
}

export function notFoundPage(origin: string, path: string): PageParts {
  return {
    status: 404,
    title: pageTitles.notFound,
    description: 'There is no state at this address.',
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>State not found</h1>
      <p>There is no state at this address. <a href="/states">See all states</a></p>`,
  }
}

/** The main navigation (`siteNav`), the same links as the Vue header. */
export function navHtml(path: string): Html {
  const current = siteNavCurrent(path)
  return html`<nav aria-label="Main">
    <ul>
      ${siteNav.map((item) => {
        const mark = current?.path !== item.path ? '' : path === item.path ? 'page' : 'true'
        return mark === ''
          ? html`<li><a href="${item.path}">${item.label}</a></li>`
          : html`<li><a href="${item.path}" aria-current="${mark}">${item.label}</a></li>`
      })}
    </ul>
  </nav>`
}

/** The compare tabs (`compareTabs`), the same links as the Vue tab row, under each heading. */
export function compareTabsHtml(path: string): Html {
  return html`<nav aria-label="${COMPARE_TABS_LABEL}">
    <ul>
      ${compareTabs.map((tab) => {
        const mark = compareTabMark(tab.path, path)
        return mark === null
          ? html`<li><a href="${tab.path}">${tab.label}</a></li>`
          : html`<li><a href="${tab.path}" aria-current="${mark}">${tab.label}</a></li>`
      })}
    </ul>
  </nav>`
}

/** The tags added to <head>. */
export function headTags(parts: PageParts): Html {
  return html`
    <link rel="canonical" href="${parts.canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${parts.title}" />
    <meta property="og:description" content="${parts.description}" />
    <meta property="og:url" content="${parts.canonical}" />
    <meta name="twitter:card" content="summary" />
    ${parts.noindex ? html`<meta name="robots" content="noindex" />` : null}
    ${parts.jsonLd.map((d) => jsonLdScript(d))}
  `
}

/** Writes the page into the built index.html. Vue mounts over #app as usual. */
export async function renderInto(indexHtml: string, parts: PageParts): Promise<string> {
  const res = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(parts.title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', parts.description)
      },
    })
    .on('head', {
      element(el) {
        el.append(headTags(parts).value, { html: true })
      },
    })
    .on('div#app', {
      element(el) {
        el.setInnerContent(navHtml(parts.path).value + parts.body.value, { html: true })
      },
    })
    .transform(new Response(indexHtml))
  return res.text()
}
