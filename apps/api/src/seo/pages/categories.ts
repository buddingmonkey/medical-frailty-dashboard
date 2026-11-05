import {
  learnMore,
  CATEGORIES_DESCRIPTION,
  CATEGORIES_HEADING,
  CATEGORIES_INTRO,
  CCSR_LINK_TEXT,
  CCSR_URL,
  federalCategoryClauseText,
  overviewCategoryGroups,
  pageTitles,
  type PublicOverviewResponse,
  STATUTE_LINK_TEXT,
  STATUTE_URL,
} from '@mfcd/shared'

import { html } from '../html'
import { compareTabsHtml, learnMoreHtml, pageJsonLd, type PageParts } from './shared'

// The categories page. Moved from seo/pages.ts (2026-11-04).

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
