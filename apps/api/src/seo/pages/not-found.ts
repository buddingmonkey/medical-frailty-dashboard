import { pageDescriptions, pageTitles } from '@mfcd/shared'

import { html } from '../html'
import { type PageParts } from './shared'

// The site-wide not-found page. Moved from seo/pages.ts (2026-11-04).

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
