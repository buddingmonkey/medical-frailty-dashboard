import {
  learnMore,
  coverageBandLabels,
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
  pageTitles,
  type PublicOverviewResponse,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { compareTabsHtml, learnMoreHtml, pageJsonLd, type PageParts } from './shared'

// The coverage overview. Moved from seo/pages.ts (2026-11-04).

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
