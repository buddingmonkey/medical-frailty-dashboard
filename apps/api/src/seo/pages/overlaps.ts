import {
  OVERLAPS_CODES_HEADING,
  OVERLAPS_COUNT_NOTE,
  OVERLAPS_DESCRIPTION,
  OVERLAPS_EMPTY,
  OVERLAPS_GROUP_HEADING,
  OVERLAPS_HEADING,
  OVERLAPS_INTRO,
  OVERLAPS_SHOW_CODES,
  OVERLAPS_SIZE_HEADING,
  overlapsStatesCaption,
  overlapsCaption,
  overlapsPageTitle,
  type OverlapsResponse,
  overlapRowText,
  overviewCategoryGroups,
  type OverviewCategory,
  formatCount,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { codeLink, compareTabsHtml, pageJsonLd, type PageParts } from './shared'

// The Overlaps tab (`/compare/overlaps`, project lead, 2026-11-12) for crawlers and readers
// without scripts: the picker as a GET form, the states' set sizes, and every exclusive
// intersection as a table row in words with its codes in a <details>. No dots or bars; the
// row header names the states. Treated like the Map tab: indexed, canonical to the bare page.

const PATH = '/compare/overlaps'

function picker(categories: readonly OverviewCategory[], current: OverviewCategory): Html {
  return html`<form method="get" action="${PATH}">
    <p>
      <label for="overlaps-category">Category</label>
      <select id="overlaps-category" name="category">
        ${overviewCategoryGroups(categories).map(
          (g) =>
            html`<optgroup label="${g.label}">
              ${g.categories.map((c) =>
                c.id === current.id
                  ? html`<option value="${c.slug}" selected>${c.label}</option>`
                  : html`<option value="${c.slug}">${c.label}</option>`,
              )}
            </optgroup>`,
        )}
      </select>
      <button type="submit">Show</button>
    </p>
  </form>`
}

function overlapsTables(data: OverlapsResponse): Html {
  if (data.intersections.length === 0) return html`<p>${OVERLAPS_EMPTY}</p>`
  const names = new Map(data.states.map((s) => [s.id, s.name]))
  return html`<p>${OVERLAPS_COUNT_NOTE}</p>
    <table>
      <caption>
        ${overlapsCaption(data.category.label)}
      </caption>
      <thead>
        <tr>
          <th scope="col">${OVERLAPS_GROUP_HEADING}</th>
          <th scope="col">${OVERLAPS_SIZE_HEADING}</th>
          <th scope="col">${OVERLAPS_CODES_HEADING}</th>
        </tr>
      </thead>
      <tbody>
        ${data.intersections.map(
          (i) =>
            html`<tr>
              <th scope="row">${overlapRowText(i, names, data.states.length)}</th>
              <td>${formatCount(i.size)}</td>
              <td>
                <details>
                  <summary>${OVERLAPS_SHOW_CODES}</summary>
                  <ul>
                    ${i.codes.map((c) => html`<li>${codeLink(c)}</li>`)}
                  </ul>
                </details>
              </td>
            </tr>`,
        )}
      </tbody>
    </table>
    <table>
      <caption>
        ${overlapsStatesCaption(data.category.label)}
      </caption>
      <thead>
        <tr>
          <th scope="col">State</th>
          <th scope="col">${OVERLAPS_SIZE_HEADING}</th>
        </tr>
      </thead>
      <tbody>
        ${data.states.map(
          (s) =>
            html`<tr>
              <th scope="row"><a href="/states/${s.slug}">${s.name}</a></th>
              <td>${formatCount(s.codeCount)}</td>
            </tr>`,
        )}
      </tbody>
    </table>`
}

/**
 * `/compare/overlaps`: `categories` for the picker (the overview's), `current` the category in
 * the URL (the first by default) and `data` its overlaps; null when no category is published.
 */
export function overlapsPage(
  origin: string,
  view: {
    categories: readonly OverviewCategory[]
    current: OverviewCategory
    data: OverlapsResponse | null
  } | null,
): PageParts {
  return {
    status: 200,
    title: overlapsPageTitle,
    description: OVERLAPS_DESCRIPTION,
    path: PATH,
    canonical: `${origin}${PATH}`,
    noindex: false,
    jsonLd: [
      pageJsonLd('CollectionPage', {
        title: overlapsPageTitle,
        description: OVERLAPS_DESCRIPTION,
        canonical: `${origin}${PATH}`,
      }),
    ],
    body: html`<h1>${OVERLAPS_HEADING}</h1>
      ${compareTabsHtml(PATH)}
      <p>${OVERLAPS_INTRO}</p>
      ${
        view === null
          ? html`<p>No categories are published yet.</p>`
          : html`${picker(view.categories, view.current)}
            ${view.data ? overlapsTables(view.data) : html`<p>${OVERLAPS_EMPTY}</p>`}`
      }`,
  }
}
