import {
  COMPARE_DESCRIPTION,
  COMPARE_HEADING,
  COMPARE_INTRO,
  compareEmptyText,
  compareCellText,
  compareFiledUnder,
  compareQualificationText,
  type CompareQuery,
  type CompareResult,
  compareSearchParams,
  compareSubject,
  downloadTableText,
  formatCount,
  pageTitles,
  STATE_CATEGORY_PREFIX,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { codeLink, compareTabsHtml, describedText, legendHtml, type PageParts } from './shared'

// Compare by category. Moved from seo/pages.ts (2026-11-04).

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
