import {
  aboutPage,
  type AboutBlock,
  type AboutInline,
  type AboutLink,
  type InfoPage,
  isExternalHref,
} from '@mfcd/shared'

import { type Html, html } from './html'
import { type PageParts, pageJsonLd } from './pages'

// About/methodology, disclaimer, privacy and accessibility (roadmap M8 step 4) as plain HTML,
// from the same data as the Vue `InfoPageView` (packages/shared/src/about.ts).

/** A link: off-site links open with `rel="noopener noreferrer external"`, as on the Vue pages. */
export function linkHtml(link: AboutLink): Html {
  return isExternalHref(link.href)
    ? html`<a href="${link.href}" rel="noopener noreferrer external">${link.text}</a>`
    : html`<a href="${link.href}">${link.text}</a>`
}

function inlineHtml(parts: readonly AboutInline[]): Html[] {
  return parts.map((part) => (typeof part === 'string' ? html`${part}` : linkHtml(part)))
}

export function blocksHtml(blocks: readonly AboutBlock[]): Html[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'p':
        return html`<p>${inlineHtml(block.parts)}</p>`
      case 'ul':
        return html`<ul>
          ${block.items.map((item) => html`<li>${inlineHtml(item)}</li>`)}
        </ul>`
      case 'dl':
        return html`<dl>
          ${block.items.map(
            (item) =>
              html`<dt>${item.term}</dt>
                <dd>${inlineHtml(item.parts)}</dd>`,
          )}
        </dl>`
    }
  })
}

/** An info page: indexed, in the pages sitemap, canonical its bare path. */
export function infoPageParts(page: InfoPage, origin: string): PageParts {
  const canonical = `${origin}${page.path}`
  return {
    status: 200,
    title: page.title,
    description: page.description,
    path: page.path,
    canonical,
    noindex: false,
    jsonLd: [
      pageJsonLd(page.path === aboutPage.path ? 'AboutPage' : 'WebPage', {
        title: page.title,
        description: page.description,
        canonical,
      }),
    ],
    body: html`<h1>${page.heading}</h1>
      ${blocksHtml(page.intro)}
      ${
        page.sections.length > 3
          ? html`<nav aria-label="On this page">
              <ul>
                ${page.sections.map((s) => html`<li><a href="#${s.id}">${s.heading}</a></li>`)}
              </ul>
            </nav>`
          : null
      }
      ${page.sections.map(
        (s) =>
          html`<section aria-labelledby="${s.id}">
            <h2 id="${s.id}">${s.heading}</h2>
            ${blocksHtml(s.blocks)}
          </section>`,
      )}`,
  }
}
