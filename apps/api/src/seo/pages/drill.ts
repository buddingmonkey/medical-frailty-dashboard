import {
  learnMore,
  CCSR_LINK_TEXT,
  CCSR_URL,
  codeSystemLabels,
  compareCellText,
  compareQualificationText,
  CCSR_CITATION,
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
  drillRulesText,
  drillSearchParams,
  drillShowLabels,
  drillShows,
  drillStatusText,
  drillUniverseNote,
  federalCategoryClauseText,
  federalCategoryInfo,
  pageDescriptions,
  pageTitles,
  drillDescription,
  STATE_CATEGORY_PREFIX,
} from '@mfcd/shared'

import { Html, html } from '../html'
import {
  codeLink,
  compareTabsHtml,
  describedText,
  learnMoreHtml,
  legendHtml,
  type PageParts,
  siteOrganization,
} from './shared'

// A category drill-down, and its not-found page. Moved from seo/pages.ts (2026-11-04).

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
