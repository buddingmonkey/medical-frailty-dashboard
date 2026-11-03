import {
  ADDED_HEADING,
  AMA_NOTICE_SHORT,
  dataLastUpdated,
  dataUpdatedText,
  FOOTER_NAV_LABEL,
  footerLinks,
  learnMore,
  REPORT_LIST_LINK_TEXT,
  REPORT_PROBLEM_URL,
  reportListText,
  CATEGORIES_DESCRIPTION,
  CATEGORIES_HEADING,
  CATEGORIES_INTRO,
  CCSR_LINK_TEXT,
  CCSR_URL,
  type CodeSystem,
  codeSystemLabels,
  COMPARE_DESCRIPTION,
  COMPARE_HEADING,
  COMPARE_INTRO,
  COMPARE_LEGEND_HEADING,
  COMPARE_TABS_LABEL,
  compareEmptyText,
  compareLegend,
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
  descriptionSourceText,
  downloadTableText,
  DRILL_ABOUT,
  DRILL_COUNT_HEADING,
  DRILL_COUNT_NOTE,
  DRILL_NOT_LISTED_NOTE,
  DRILL_RULES_HEADING,
  DRILL_UNIVERSE_LABEL,
  drillCaption,
  drillCcsrHeading,
  type DrillCell,
  drillCodeTablePath,
  drillCountText,
  drillCsvPath,
  type DrillDetailResponse,
  drillDetailCountText,
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
  ENTRY_DEFINITION,
  type FederalCategory,
  FEDERAL_OVERLAP_NOTE,
  federalCategoryClauseText,
  federalCategoryInfo,
  federalCountsOverlap,
  FOOTER_TEXT,
  formatCount,
  formatDay,
  HOME_INTRO,
  MAP_DESCRIPTION,
  NO_DESCRIPTION,
  noListText,
  OVERVIEW_CAPTION,
  OVERVIEW_DESCRIPTION,
  OVERVIEW_HEADING,
  OVERVIEW_INTRO,
  OVERVIEW_NO_LIST,
  OVERVIEW_NOT_REVIEWED,
  OVERVIEW_OVERALL_HEADING,
  overviewCategoryGroups,
  overviewCellNotReviewed,
  overviewCellText,
  overviewDrillDownPath,
  overviewOrderFromQuery,
  overviewOverall,
  overviewReadingNotes,
  orderOverviewStates,
  pageDescriptions,
  pageTitles,
  SHARE_IMAGE,
  SITE_ICONS,
  THEME_COLORS,
  drillDescription,
  stateDescription,
  statesCompareDescription,
  STATES_COMPARE_NOT_FOUND_DESCRIPTION,
  type PublicOverviewResponse,
  type PublicStateDetail,
  type PublicStateSummary,
  type Qualification,
  qualificationLabels,
  REVIEW_STATUS_HEADING,
  reviewStatusText,
  SITE_NAME,
  siteNav,
  siteNavCurrent,
  SOURCE_DATE_HEADING,
  sourceDetailsText,
  STATE_CATEGORY_PREFIX,
  STATE_COUNT_CAPTIONS,
  stateCategoriesIntro,
  stateCategoryName,
  stateStatusLabels,
  statesWithListText,
  SIMILAR_PICK_MAX,
  type SimilarState,
  SIMILARITY_LABEL,
  SIMILARITY_NOTE,
  similarityText,
  STATES_COMPARE_BASIS_NOTE,
  STATES_COMPARE_DIFFERS,
  STATES_COMPARE_INTRO,
  STATES_COMPARE_MAX,
  STATES_COMPARE_MIN,
  STATES_COMPARE_NOT_FOUND_TEXT,
  STATES_COMPARE_SUMMARY_NOTE,
  statesCompareAllLabel,
  statesCompareCaption,
  statesCompareCsvPath,
  statesCompareGroupCountText,
  statesCompareGroupDiffText,
  statesCompareNames,
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
  STATES_PICKER_LABELS,
  STATUTE_CITATION,
  STATUTE_LINK_TEXT,
  STATUTE_URL,
  TILE_MAP_HEADING,
  TILE_MAP_HOME_LINK,
  TILE_MAP_INTRO,
  TILE_MAP_NOT_REVIEWED_NOTE,
  tileMapCaption,
  tileMapCategory,
  tileMapTiles,
} from '@mfcd/shared'

import { Html, html, jsonLdScript } from './html'
import { linkHtml } from './info-page'

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
  /**
   * The newest published list's last update (ISO) for the footer's "Data last updated", when
   * the page's own query already has it. Left out, `sendPage` reads it (`listsUpdatedAt`).
   */
  dataUpdatedAt?: string | null
}

/** A "learn more" link to a section of About (`learnMore`). */
function learnMoreHtml(link: { text: string; href: string }): Html {
  return html`<a href="${link.href}">${link.text}</a>`
}

const HOME_DESCRIPTION = pageDescriptions.home

/** This site as a schema.org `Organization`: the publisher and creator in JSON-LD. */
export const siteOrganization = (origin: string) => ({
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${origin}/`,
})

/**
 * A page's own JSON-LD (docs/seo.md, "Structured data"): its type, name (the title),
 * description and canonical URL, part of this site.
 */
export function pageJsonLd(
  type: 'WebPage' | 'CollectionPage' | 'AboutPage',
  parts: Pick<PageParts, 'title' | 'description' | 'canonical'>,
): Record<string, unknown> {
  const origin = new URL(parts.canonical).origin
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: parts.title,
    description: parts.description,
    url: parts.canonical,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` },
    publisher: siteOrganization(origin),
  }
}

/** "Read the law" with its citation, as on the Vue pages. */
function statuteLink(): Html {
  return html`<a href="${STATUTE_URL}" rel="noopener noreferrer external">${STATUTE_LINK_TEXT}</a>
    (${STATUTE_CITATION})`
}

/** The footer of every page, the same words and links as the Vue `SiteFooter`. */
export function footerHtml(dataUpdatedAt: string | null): Html {
  return html`<footer>
    <nav aria-label="${FOOTER_NAV_LABEL}">
      <ul>
        ${footerLinks.map((link) => html`<li>${linkHtml(link)}</li>`)}
      </ul>
    </nav>
    ${dataUpdatedAt ? html`<p>${dataUpdatedText(dataUpdatedAt)}</p>` : null}
    <p>${FOOTER_TEXT}</p>
    <p>${statuteLink()}</p>
    <p>${AMA_NOTICE_SHORT}</p>
  </footer>`
}

/** What each cell word and the badges mean, under every code table (Vue `StatusLegend`). */
function legendHtml(): Html {
  return html`<h3>${COMPARE_LEGEND_HEADING}</h3>
    <dl>
      ${compareLegend.map(
        (item) =>
          html`<dt>${item.term}</dt>
            <dd>${item.text}</dd>`,
      )}
    </dl>
    <p>${learnMoreHtml(learnMore.badges)}</p>`
}

/** A description and, when it is the state's own text, the state that published it. */
function describedText(
  r: Pick<DrillRow, 'description' | 'descriptionSource'>,
  stateName: (id: string) => string,
): string {
  if (r.description === null) return NO_DESCRIPTION
  return r.descriptionSource && r.descriptionSource !== 'cms'
    ? `${r.description} (${descriptionSourceText(stateName(r.descriptionSource))})`
    : r.description
}

/** A code in a table, linked to its page when it has one (single codes; M6 step 5). */
function codeLink(r: { display: string; codePath: string | null }): Html {
  return r.codePath ? html`<a href="${r.codePath}">${r.display}</a>` : html`${r.display}`
}

export const downloadName = (slug: string, versionNo: number, ext: 'csv' | 'json') =>
  `${slug}-medical-frailty-codes-v${String(versionNo)}.${ext}`

/** Every state with its status, entries and date: the home page and `/states`. */
function stateListTable(items: readonly PublicStateSummary[]): Html {
  return html`<table>
    <caption>
      State medical frailty code lists
    </caption>
    <thead>
      <tr>
        <th scope="col">State</th>
        <th scope="col">Status</th>
        <th scope="col">Entries</th>
        <th scope="col">${SOURCE_DATE_HEADING}</th>
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
    description: pageDescriptions.states,
    path: '/states',
    canonical: `${origin}/states`,
    noindex: false,
    jsonLd: [],
    dataUpdatedAt: dataLastUpdated(items),
    body: html`<h1>All states</h1>
      <p>${statesWithListText(withList)} Choose a state to see its list, sources and history.</p>
      <p>${ENTRY_DEFINITION}</p>
      ${stateListTable(items)}`,
  }
}

/**
 * "One category, every state" (roadmap M5 step 8) for crawlers, on the Map tab
 * (`/compare/map`): the category in the URL (the first by default) as a plain table of
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

/**
 * `/compare/map`, the Map tab: the tile map (on the home page until 2026-11-03, when the project
 * lead moved it here). Indexed, canonical to the bare page whatever its `?category=`.
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
    jsonLd: [
      pageJsonLd('CollectionPage', {
        title: pageTitles.map,
        description: MAP_DESCRIPTION,
        canonical: `${origin}${path}`,
      }),
    ],
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
    jsonLd: [
      pageJsonLd('CollectionPage', {
        title: pageTitles.categories,
        description: CATEGORIES_DESCRIPTION,
        canonical: `${origin}${path}`,
      }),
    ],
    body: html`<h1>${CATEGORIES_HEADING}</h1>
      ${compareTabsHtml(path)}
      <p>${CATEGORIES_INTRO} ${learnMoreHtml(learnMore.categories)}</p>
      <p>
        <a href="${CCSR_URL}" rel="noopener noreferrer external">${CCSR_LINK_TEXT}</a>
        <a href="${STATUTE_URL}" rel="noopener noreferrer external">${STATUTE_LINK_TEXT}</a>
      </p>
      ${
        groups.length === 0
          ? html`<p>No categories are published yet.</p>`
          : groups.map(
              (g) =>
                html`<h2>${g.label}</h2>
                  ${federalCategoryClauseText(g.federalCategory) ? html`<p>${federalCategoryClauseText(g.federalCategory)}</p>` : null}
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

export function homePage(items: readonly PublicStateSummary[], origin: string): PageParts {
  const withList = items.filter((s) => s.published !== null).length
  const url = `${origin}/`
  return {
    status: 200,
    title: pageTitles.home,
    description: HOME_DESCRIPTION,
    path: '/',
    canonical: url,
    noindex: false,
    dataUpdatedAt: dataLastUpdated(items),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url,
        description: HOME_DESCRIPTION,
        publisher: siteOrganization(origin),
      },
    ],
    body: html`<h1>Compare medical frailty codes by state</h1>
      <p>${HOME_INTRO} ${learnMoreHtml(learnMore.home)}</p>
      <p>${statuteLink()}</p>
      <h2>States</h2>
      <p>${statesWithListText(withList)}</p>
      <p>${ENTRY_DEFINITION}</p>
      ${stateListTable(items)}
      <p><a href="/compare/map">${TILE_MAP_HOME_LINK}</a></p>`,
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

const categoryName = stateCategoryName

/** The answer in plain sentences, near the top (docs/seo.md, "Facts that AI can quote"). */
function summarySentences(detail: PublicStateDetail): string[] {
  const { state } = detail
  const p = state.published
  if (!p) return [noListText(state.name, state.status === 'announced')]
  const dated = p.sourceDate
    ? `from the state’s document dated ${formatDay(p.sourceDate)}`
    : 'from a state document that gives no date'
  const sentences = [
    `${state.name}’s medical frailty code list on this site has ${formatCount(p.totalEntries)} entries (version ${String(p.versionNo)}), ${dated}.`,
  ]
  const byRule = (Object.entries(p.byQualification) as [Qualification, number][])
    .filter(([, n]) => n > 0)
    .map(([q, n]) => `${qualificationLabels[q]}, ${formatCount(n)}`)
  if (byRule.length > 0) sentences.push(`${STATE_COUNT_CAPTIONS.rule}: ${byRule.join('; ')}.`)
  if (p.updatedAt) sentences.push(`Last updated on this site ${formatDay(p.updatedAt)}.`)
  return sentences
}

export function statePage(detail: PublicStateDetail, origin: string): PageParts {
  const { state } = detail
  const p = state.published
  const url = `${origin}/states/${state.slug}`
  const sentences = summarySentences(detail)
  const description = stateDescription(state)

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
        <p>${ENTRY_DEFINITION}</p>
        ${countTable(STATE_COUNT_CAPTIONS.system, p.bySystem, (k: CodeSystem) => codeSystemLabels[k])}
        ${countTable(STATE_COUNT_CAPTIONS.federal, p.byFederalCategory, (k: FederalCategory) => federalCategoryInfo[k].label)}
        ${federalCountsOverlap(p) ? html`<p>${FEDERAL_OVERLAP_NOTE}</p>` : null}
        ${countTable(STATE_COUNT_CAPTIONS.rule, p.byQualification, (k: Qualification) => qualificationLabels[k])}
        <h2>Categories</h2>
        <p>${stateCategoriesIntro(state.name)} ${learnMoreHtml(learnMore.stateCategories)}</p>
        <table>
          <caption>
            ${state.name}’s categories
          </caption>
          <thead>
            <tr>
              <th scope="col">State category</th>
              <th scope="col">Federal category</th>
              <th scope="col">Entries</th>
              <th scope="col">${REVIEW_STATUS_HEADING}</th>
            </tr>
          </thead>
          <tbody>
            ${detail.categories.map(
              (c) =>
                html`<tr>
                  <th scope="row">${categoryName(c.stateCategory, c.stateSubcategory)}</th>
                  <td>${federalCategoryInfo[c.federalCategory].label}</td>
                  <td>${formatCount(c.entries)}</td>
                  <td>${reviewStatusText(c.confirmed)}</td>
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
                · ${sourceDetailsText(s)}
              </li>`,
          )}
        </ul>
        <h2>Downloads</h2>
        <ul>
          <li><a href="/states/${state.slug}/codes.csv">${state.name} codes (CSV)</a></li>
          <li><a href="/states/${state.slug}/codes.json">${state.name} codes (JSON)</a></li>
        </ul>
        <p>${learnMoreHtml(learnMore.downloads)}</p>
        <h2>Version history</h2>
        <table>
          <caption>
            Version history
          </caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">${ADDED_HEADING}</th>
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
      ${sentences.map((s) => html`<p>${s}</p>`)}
      ${
        p
          ? null
          : html`<p>
              ${reportListText(state.name)}
              ${linkHtml({ text: REPORT_LIST_LINK_TEXT, href: REPORT_PROBLEM_URL })}
            </p>`
      }
      ${listed} ${notes}`,
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
    <p>${SIMILARITY_NOTE} ${learnMoreHtml(learnMore.similarity)}</p>
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
  const intro = html`<h1>${COMPARE_HEADING}</h1>
    ${compareTabsHtml('/compare/codes')}
    <p>${COMPARE_INTRO}</p>`
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
    const stateName = (id: string) => names.get(id) ?? id
    const table =
      result.totalRows === 0
        ? html`<p>${compareEmptyText(query.alone)}</p>`
        : html`<table>
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
                    <th scope="row">${codeLink(row)}</th>
                    <td>${describedText(row, stateName)}</td>
                    ${row.cells.map((cell, i) => {
                      const stateId = result.states[i]?.id ?? ''
                      const m = cell.match
                      const filed = m ? compareFiledUnder(query, stateId, m) : null
                      const text = [
                        compareCellText(cell),
                        m?.tier,
                        m ? compareQualificationText(m) : null,
                        filed ? `${STATE_CATEGORY_PREFIX} ${filed}` : null,
                      ]
                        .filter((part) => part !== null && part !== undefined && part !== '')
                        .join('; ')
                      return html`<td>${text}</td>`
                    })}
                  </tr>`,
              )}
            </tbody>
          </table>`
    body = html`${intro}
      <h2>${subject}: codes by state</h2>
      <p>
        ${formatCount(result.totalRows)} codes, page ${result.page} of ${result.pageCount}.
        ${result.totalRows > 0 ? html`<a href="${compareCsvPath(query)}">${downloadTableText(result.totalRows)}</a>` : null}
      </p>
      ${table} ${legendHtml()}`
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
 * unified category. Indexed: it is the one page that answers "how much of each category each
 * state lists".
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

  /** A column's label; † marks a category without a reference list. */
  const headerLabel = (c: PublicOverviewResponse['categories'][number]) =>
    c.coverageBasis === 'union' ? `${c.label} †` : c.label

  const intro = html`<h1>${OVERVIEW_HEADING}</h1>
    ${compareTabsHtml('/compare')}
    <p>${OVERVIEW_INTRO}</p>`
  const table =
    categories.length === 0
      ? html`<p>No categories are published yet.</p>`
      : html`<table>
          <caption>
            ${OVERVIEW_CAPTION}
          </caption>
          <thead>
            <tr>
              <th scope="col" rowspan="2">State</th>
              ${groups.map(
                (g) => html`<th scope="colgroup" colspan="${g.categories.length}">${g.label}</th>`,
              )}
              ${headerOpen('overall', 'scope="col" rowspan="2"')}${OVERVIEW_OVERALL_HEADING}</th>
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
    jsonLd: [
      pageJsonLd('CollectionPage', {
        title: pageTitles.overview,
        description: OVERVIEW_DESCRIPTION,
        canonical: `${origin}/compare`,
      }),
    ],
    body: html`${intro} ${table}
      <h2>Reading this table</h2>
      ${overviewReadingNotes.map((p) => html`<p>${p}</p>`)}
      <p>${learnMoreHtml(learnMore.overview)}</p>
      <p>
        Shades:
        ${[...(['high', 'mid', 'low', 'none'] as const).map((b) => coverageBandLabels[b]), OVERVIEW_NO_LIST].join('; ')}.
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
    filed ? `${STATE_CATEGORY_PREFIX} ${filed}` : null,
  ]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join('; ')
}

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
    <p>${drillDetailCountText(row.count, detail.statesWithList)}</p>
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
    ${abbreviations(`Not listed (${DRILL_NOT_LISTED_NOTE.toLowerCase()})`, notListed)}
    ${abbreviations('No list on this site', noList)}
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
  const caption = drillCaption(category.label)
  const total = data.states.length
  const stateName = (id: string) => data.states.find((s) => s.id === id)?.name ?? id
  const clause = federalCategoryClauseText(category.federalCategory)

  const about = html`<h1>${category.label}</h1>
    ${compareTabsHtml(path)}
    <p>
      ${DRILL_ABOUT} <a href="/compare/categories">See every comparison category</a> ·
      ${learnMoreHtml(learnMore.categories)}
    </p>
    <p>
      Federal category:
      ${federalCategoryInfo[category.federalCategory].label}.${clause ? ` ${clause}` : ''}
    </p>
    <p>${category.definition}</p>
    ${category.includes ? html`<p>Includes: ${category.includes}</p>` : null}
    ${category.excludes ? html`<p>Excludes: ${category.excludes}</p>` : null}
    ${
      category.ccsr.length === 0
        ? null
        : html`<h2>${drillCcsrHeading(category.ccsr.length)}</h2>
            <ul>
              ${category.ccsr.map((g) => html`<li>${g.id}: ${g.description}</li>`)}
            </ul>
            <p>
              Source: ${CCSR_CITATION}
              <a href="${CCSR_URL}" rel="noopener noreferrer external">${CCSR_LINK_TEXT}</a>
            </p>`
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
        ${DRILL_UNIVERSE_LABEL}</label
      >
      ${drillUniverseNote(category.universeSize)}
    </p>
    <p><button type="submit">Apply</button></p>
  </form>`

  const links = html`<p>
    <a href="${drillCsvPath(category.slug, applied)}">${downloadTableText(data.totalRows)}</a>.
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
      : html`<p>${DRILL_COUNT_NOTE}</p>
          <table>
            <caption>
              ${caption}
            </caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Description</th>
                <th scope="col">${DRILL_COUNT_HEADING}</th>
                <th scope="col">${DRILL_RULES_HEADING}</th>
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
                        <th scope="row">${codeLink(r)}</th>
                        <td>${describedText(r, stateName)}</td>
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
    description: drillDescription(category.definition),
    path,
    canonical: `${origin}${path}`,
    noindex: hasQuery,
    // A Dataset: the category's codes by state, downloadable as CSV. Google wants 50 or more
    // characters of description, so the definition comes with the sentence on what a category is.
    jsonLd: hasQuery
      ? []
      : [
          {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: caption,
            description: `${category.definition} ${DRILL_ABOUT}`,
            url: `${origin}${path}`,
            creator: siteOrganization(origin),
            isAccessibleForFree: true,
            distribution: [
              {
                '@type': 'DataDownload',
                encodingFormat: 'text/csv',
                contentUrl: `${origin}${path}/codes.csv`,
              },
            ],
          },
        ],
    body: html`${about} ${form}
      <p>${drillStatusText(data)}</p>
      ${links} ${table} ${pager} ${legendHtml()} ${detail ? drillDetailHtml(detail) : null}`,
  }
}

/** The comparison's pickers as a GET form (`/compare/states?states=…` redirects). */
function statesPickerForm(
  choices: readonly { slug: string; name: string }[],
  currentSlugs: readonly string[] = [],
): Html {
  return html`<form method="get" action="/compare/states">
    <fieldset>
      <legend>States to compare</legend>
      ${STATES_PICKER_LABELS.slice(0, STATES_COMPARE_MAX).map((label, i) => {
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
  const nameOf = (id: string) => data.states.find((s) => s.id === id)?.name ?? id
  const summary = data.summary
  const description = statesCompareDescription(data)

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
          ? html`<dt>${SIMILARITY_LABEL}</dt>
              <dd>${similarityText(summary.similarity.jaccard)}</dd>`
          : null
      }
    </dl>
    <p>
      ${STATES_COMPARE_SUMMARY_NOTE}
      ${summary.similarity ? `${STATES_COMPARE_BASIS_NOTE} ${SIMILARITY_NOTE}` : ''}
      ${summary.similarity ? learnMoreHtml(learnMore.similarity) : null}
    </p>`

  const links = html`<p>
    ${
      data.query.diff
        ? html`<a href="${href({ diff: false })}">Show every code</a>`
        : html`<a href="${href({ diff: true })}">Show only differences</a>`
    }.
    <a href="${statesCompareCsvPath(data.states.map((s) => s.id))}">Download every code (CSV)</a>.
  </p>`

  const groupHeading = (g: StatesCompareResponse['groups'][number]) => {
    const differ = `${statesCompareGroupDiffText(g.differing, g.allRows)}${g.continued ? ', continued' : ''}`
    return g.slug
      ? html`<a href="/compare/${g.slug}">${g.label}</a> (${differ})`
      : html`${g.label} (${differ})`
  }
  const rowHeading = (r: StatesCompareResponse['groups'][number]['rows'][number]) =>
    html`${codeLink(r)}${!data.query.diff && r.differs ? ` (${STATES_COMPARE_DIFFERS.toLowerCase()})` : ''}`

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
                      <td>${describedText(r, nameOf)}</td>
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
    description: STATES_COMPARE_NOT_FOUND_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>Comparison not found</h1>
      ${compareTabsHtml(path)}
      <p>
        ${reason} ${STATES_COMPARE_NOT_FOUND_TEXT}
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
    dataUpdatedAt: dataLastUpdated(items),
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
    description: pageDescriptions.categoryNotFound,
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
    description: pageDescriptions.notFound,
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

/**
 * The icons, manifest and theme colours (roadmap M8 step 4). apps/web/index.html carries the
 * same tags for the browser-only pages; `renderInto` drops those and writes these, so a page
 * has one set and the API tests can see it.
 */
export function siteIconTags(): Html {
  return html`
    <link rel="icon" href="${SITE_ICONS.svg}" type="image/svg+xml" />
    <link rel="icon" href="${SITE_ICONS.png32}" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="${SITE_ICONS.appleTouch}" />
    <link rel="manifest" href="${SITE_ICONS.manifest}" />
    <meta
      name="theme-color"
      content="${THEME_COLORS.light}"
      media="(prefers-color-scheme: light)"
    />
    <meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" />
  `
}

/** The tags added to <head>. `og:image` is absolute, on the canonical URL's origin. */
export function headTags(parts: PageParts): Html {
  const origin = new URL(parts.canonical).origin
  return html`
    <link rel="canonical" href="${parts.canonical}" />
    ${siteIconTags()}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${parts.title}" />
    <meta property="og:description" content="${parts.description}" />
    <meta property="og:url" content="${parts.canonical}" />
    <meta property="og:image" content="${origin}${SHARE_IMAGE.path}" />
    <meta property="og:image:type" content="${SHARE_IMAGE.type}" />
    <meta property="og:image:width" content="${SHARE_IMAGE.width}" />
    <meta property="og:image:height" content="${SHARE_IMAGE.height}" />
    <meta property="og:image:alt" content="${SHARE_IMAGE.alt}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${parts.noindex ? html`<meta name="robots" content="noindex" />` : null}
    ${parts.jsonLd.map((d) => jsonLdScript(d))}
  `
}

/** index.html's own copies of the tags `headTags` writes, removed so none appears twice. */
const REPLACED_HEAD_TAGS = [
  'link[rel="icon"]',
  'link[rel="apple-touch-icon"]',
  'link[rel="manifest"]',
  'link[rel="canonical"]',
  'meta[name="theme-color"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
].join(', ')

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
    .on(REPLACED_HEAD_TAGS, {
      element(el) {
        el.remove()
      },
    })
    .on('head', {
      element(el) {
        el.append(headTags(parts).value, { html: true })
      },
    })
    .on('div#app', {
      element(el) {
        el.setInnerContent(
          navHtml(parts.path).value +
            parts.body.value +
            footerHtml(parts.dataUpdatedAt ?? null).value,
          { html: true },
        )
      },
    })
    .transform(new Response(indexHtml))
  return res.text()
}
