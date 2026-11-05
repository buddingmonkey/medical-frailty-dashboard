import {
  MAP_DESCRIPTION,
  OVERVIEW_NOT_REVIEWED,
  overviewCategoryGroups,
  pageTitles,
  type PublicOverviewResponse,
  TILE_MAP_HEADING,
  TILE_MAP_INTRO,
  TILE_MAP_NOT_REVIEWED_NOTE,
  tileMapCaption,
  tileMapCategory,
  tileMapTiles,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { compareTabsHtml, pageJsonLd, type PageParts } from './shared'

// The tile map (`/map`). Moved from seo/pages.ts (2026-11-04).

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
