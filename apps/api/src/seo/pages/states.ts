import {
  dataLastUpdated,
  ENTRY_DEFINITION,
  formatCount,
  formatDay,
  pageDescriptions,
  pageTitles,
  type PublicStateSummary,
  SOURCE_DATE_HEADING,
  stateStatusLabels,
  statesWithListText,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { type PageParts } from './shared'

// The state list (`/states`). Moved from seo/pages.ts (2026-11-04).

/** Every state with its status, entries and date: the home page and `/states`. */
export function stateListTable(items: readonly PublicStateSummary[]): Html {
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
