import {
  AMA_NOTICE_SHORT,
  dataUpdatedText,
  FOOTER_NAV_LABEL,
  footerLinks,
  learnMore,
  COMPARE_LEGEND_HEADING,
  COMPARE_TABS_LABEL,
  compareLegend,
  compareTabMark,
  compareTabs,
  descriptionSourceText,
  type DrillRow,
  FOOTER_TEXT,
  NO_DESCRIPTION,
  SHARE_IMAGE,
  SITE_ICONS,
  THEME_COLORS,
  SITE_NAME,
  siteNav,
  siteNavCurrent,
  STATUTE_CITATION,
  STATUTE_LINK_TEXT,
  STATUTE_URL,
} from '@mfcd/shared'

import { Html, html, jsonLdScript } from '../html'
import { linkHtml } from '../info-page'

// Helpers every server-rendered page shares: the page parts, JSON-LD, footer, navigation,
// head tags and the rewrite into the built index.html. Moved from seo/pages.ts (2026-11-04).

// The content of each public page as plain semantic HTML, for crawlers that do not run
// JavaScript (docs/seo.md). Vue replaces it when it mounts. Wording and numbers come from the
// same shared helpers as the Vue pages, so both say the same thing.

export interface PageParts {
  status: 200 | 404
  /** The page's path, to mark the current link in the navigation. */
  path: string
  title: string
  description: string
  /** Absolute URL. */
  canonical: string
  noindex: boolean
  jsonLd: unknown[]
  body: Html
  /**
   * The newest published list's last update (ISO) for the footer's "Data last updated", when
   * the page's own query already has it. Left out, `sendPage` reads it (`listsUpdatedAt`).
   */
  dataUpdatedAt?: string | null
}

/** A "learn more" link to a section of About (`learnMore`). */
export function learnMoreHtml(link: { text: string; href: string }): Html {
  return html`<a href="${link.href}">${link.text}</a>`
}

/** This site as a schema.org `Organization`: the publisher and creator in JSON-LD. */
export const siteOrganization = (origin: string) => ({
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${origin}/`,
})

/**
 * A page's own JSON-LD (docs/seo.md, "Structured data"): its type, name (the title),
 * description and canonical URL, part of this site.
 */
export function pageJsonLd(
  type: 'WebPage' | 'CollectionPage' | 'AboutPage',
  parts: Pick<PageParts, 'title' | 'description' | 'canonical'>,
): Record<string, unknown> {
  const origin = new URL(parts.canonical).origin
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: parts.title,
    description: parts.description,
    url: parts.canonical,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` },
    publisher: siteOrganization(origin),
  }
}

/** "Read the law" with its citation, as on the Vue pages. */
export function statuteLink(): Html {
  return html`<a href="${STATUTE_URL}" rel="noopener noreferrer external">${STATUTE_LINK_TEXT}</a>
    (${STATUTE_CITATION})`
}

/** The footer of every page, the same words and links as the Vue `SiteFooter`. */
export function footerHtml(dataUpdatedAt: string | null): Html {
  return html`<footer>
    <nav aria-label="${FOOTER_NAV_LABEL}">
      <ul>
        ${footerLinks.map((link) => html`<li>${linkHtml(link)}</li>`)}
      </ul>
    </nav>
    ${dataUpdatedAt ? html`<p>${dataUpdatedText(dataUpdatedAt)}</p>` : null}
    <p>${FOOTER_TEXT}</p>
    <p>${statuteLink()}</p>
    <p>${AMA_NOTICE_SHORT}</p>
  </footer>`
}

/** What each cell word and the badges mean, under every code table (Vue `StatusLegend`). */
export function legendHtml(): Html {
  return html`<h3>${COMPARE_LEGEND_HEADING}</h3>
    <dl>
      ${compareLegend.map(
        (item) =>
          html`<dt>${item.term}</dt>
            <dd>${item.text}</dd>`,
      )}
    </dl>
    <p>${learnMoreHtml(learnMore.badges)}</p>`
}

/** A description and, when it is the state's own text, the state that published it. */
export function describedText(
  r: Pick<DrillRow, 'description' | 'descriptionSource'>,
  stateName: (id: string) => string,
): string {
  if (r.description === null) return NO_DESCRIPTION
  return r.descriptionSource && r.descriptionSource !== 'cms'
    ? `${r.description} (${descriptionSourceText(stateName(r.descriptionSource))})`
    : r.description
}

/** A code in a table, linked to its page when it has one (single codes; M6 step 5). */
export function codeLink(r: { display: string; codePath: string | null }): Html {
  return r.codePath ? html`<a href="${r.codePath}">${r.display}</a>` : html`${r.display}`
}

/** The main navigation (`siteNav`), the same links as the Vue header. */
export function navHtml(path: string): Html {
  const current = siteNavCurrent(path)
  return html`<nav aria-label="Main">
    <ul>
      ${siteNav.map((item) => {
        const mark = current?.path !== item.path ? '' : path === item.path ? 'page' : 'true'
        return mark === ''
          ? html`<li><a href="${item.path}">${item.label}</a></li>`
          : html`<li><a href="${item.path}" aria-current="${mark}">${item.label}</a></li>`
      })}
    </ul>
  </nav>`
}

/** The compare tabs (`compareTabs`), the same links as the Vue tab row, under each heading. */
export function compareTabsHtml(path: string): Html {
  return html`<nav aria-label="${COMPARE_TABS_LABEL}">
    <ul>
      ${compareTabs.map((tab) => {
        const mark = compareTabMark(tab.path, path)
        return mark === null
          ? html`<li><a href="${tab.path}">${tab.label}</a></li>`
          : html`<li><a href="${tab.path}" aria-current="${mark}">${tab.label}</a></li>`
      })}
    </ul>
  </nav>`
}

/**
 * The icons, manifest and theme colours (roadmap M8 step 4). apps/web/index.html carries the
 * same tags for the browser-only pages; `renderInto` drops those and writes these, so a page
 * has one set and the API tests can see it.
 */
export function siteIconTags(): Html {
  return html`
    <link rel="icon" href="${SITE_ICONS.svg}" type="image/svg+xml" />
    <link rel="icon" href="${SITE_ICONS.png32}" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="${SITE_ICONS.appleTouch}" />
    <link rel="manifest" href="${SITE_ICONS.manifest}" />
    <meta
      name="theme-color"
      content="${THEME_COLORS.light}"
      media="(prefers-color-scheme: light)"
    />
    <meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" />
  `
}

/** The tags added to <head>. `og:image` is absolute, on the canonical URL's origin. */
export function headTags(parts: PageParts): Html {
  const origin = new URL(parts.canonical).origin
  return html`
    <link rel="canonical" href="${parts.canonical}" />
    ${siteIconTags()}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${parts.title}" />
    <meta property="og:description" content="${parts.description}" />
    <meta property="og:url" content="${parts.canonical}" />
    <meta property="og:image" content="${origin}${SHARE_IMAGE.path}" />
    <meta property="og:image:type" content="${SHARE_IMAGE.type}" />
    <meta property="og:image:width" content="${SHARE_IMAGE.width}" />
    <meta property="og:image:height" content="${SHARE_IMAGE.height}" />
    <meta property="og:image:alt" content="${SHARE_IMAGE.alt}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${parts.noindex ? html`<meta name="robots" content="noindex" />` : null}
    ${parts.jsonLd.map((d) => jsonLdScript(d))}
  `
}

/** index.html's own copies of the tags `headTags` writes, removed so none appears twice. */
const REPLACED_HEAD_TAGS = [
  'link[rel="icon"]',
  'link[rel="apple-touch-icon"]',
  'link[rel="manifest"]',
  'link[rel="canonical"]',
  'meta[name="theme-color"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
].join(', ')

/** Writes the page into the built index.html. Vue mounts over #app as usual. */
export async function renderInto(indexHtml: string, parts: PageParts): Promise<string> {
  const res = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(parts.title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', parts.description)
      },
    })
    .on(REPLACED_HEAD_TAGS, {
      element(el) {
        el.remove()
      },
    })
    .on('head', {
      element(el) {
        el.append(headTags(parts).value, { html: true })
      },
    })
    .on('div#app', {
      element(el) {
        // The same landmarks as the Vue app (App.vue): a skip link, the nav in a header, the
        // page in <main>, then the footer (M8 step 2).
        el.setInnerContent(
          '<a href="#main">Skip to main content</a><header>' +
            navHtml(parts.path).value +
            '</header><main id="main">' +
            parts.body.value +
            '</main>' +
            footerHtml(parts.dataUpdatedAt ?? null).value,
          { html: true },
        )
      },
    })
    .transform(new Response(indexHtml))
  return res.text()
}
