import {
  dataLastUpdated,
  learnMore,
  ENTRY_DEFINITION,
  HOME_INTRO,
  pageDescriptions,
  pageTitles,
  type PublicStateSummary,
  SITE_NAME,
  statesWithListText,
  TILE_MAP_HOME_LINK,
} from '@mfcd/shared'

import { html } from '../html'
import { learnMoreHtml, type PageParts, siteOrganization, statuteLink } from './shared'
import { stateListTable } from './states'

// The home page (`/`). Moved from seo/pages.ts (2026-11-04).

const HOME_DESCRIPTION = pageDescriptions.home

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
