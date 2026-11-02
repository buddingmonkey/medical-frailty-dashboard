import {
  type CodeSystem,
  codeSystemLabels,
  type FederalCategory,
  federalCategoryInfo,
  formatCount,
  formatDay,
  pageTitles,
  type PublicStateDetail,
  type PublicStateSummary,
  type Qualification,
  qualificationLabels,
  SITE_NAME,
  stateStatusLabels,
  STATES_AND_DC,
} from '@mfcd/shared'

import { type Html, html, jsonLdScript } from './html'

// The content of each public page as plain semantic HTML, for crawlers that do not run
// JavaScript (docs/seo.md). Vue replaces it when it mounts. Wording and numbers come from the
// same shared helpers as the Vue pages, so both say the same thing.

export interface PageParts {
  status: 200 | 404
  title: string
  description: string
  /** Absolute URL. */
  canonical: string
  noindex: boolean
  jsonLd: unknown[]
  body: Html
}

const HOME_DESCRIPTION =
  'Compare the code lists US states use to mark Medicaid members as medically frail, the ' +
  'exemption from the H.R.1 work requirements.'

export const downloadName = (slug: string, versionNo: number, ext: 'csv' | 'json') =>
  `${slug}-medical-frailty-codes-v${String(versionNo)}.${ext}`

export function homePage(items: readonly PublicStateSummary[], origin: string): PageParts {
  const withList = items.filter((s) => s.published !== null).length
  const url = `${origin}/`
  return {
    status: 200,
    title: pageTitles.home,
    description: HOME_DESCRIPTION,
    canonical: url,
    noindex: false,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url,
        description: HOME_DESCRIPTION,
      },
    ],
    body: html`<h1>Compare medical frailty codes by state</h1>
      <p>
        Under H.R.1, Medicaid members who are medically frail are exempt from work requirements.
        Each state publishes its own list of diagnosis and service codes for frailty. This site puts
        those lists side by side.
      </p>
      <h2>States</h2>
      <p>${withList} of ${STATES_AND_DC} states and DC have a list on this site.</p>
      <table>
        <caption>
          State frailty code lists
        </caption>
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">Status</th>
            <th scope="col">Entries</th>
            <th scope="col">State list dated</th>
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
      </table>`,
  }
}

function countTable<K extends string>(
  caption: string,
  counts: Record<K, number>,
  label: (key: K) => string,
): Html {
  const rows = (Object.entries(counts) as [K, number][]).filter(([, n]) => n > 0)
  return html`<table>
    <caption>
      ${caption}
    </caption>
    <tbody>
      ${rows.map(
        ([key, n]) =>
          html`<tr>
            <th scope="row">${label(key)}</th>
            <td>${formatCount(n)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`
}

function categoryName(category: string, subcategory: string) {
  if (category === '' && subcategory === '') return '(no category)'
  return subcategory === '' ? category : `${category} › ${subcategory}`
}

/** The answer in plain sentences, near the top (docs/seo.md, "Facts that AI can quote"). */
function summarySentences(detail: PublicStateDetail): string[] {
  const { state } = detail
  const p = state.published
  if (!p) {
    return [
      state.status === 'announced'
        ? `${state.name} has announced a list of medical frailty codes. It is not on this site yet.`
        : `${state.name} has not published a list of medical frailty codes that we know of.`,
    ]
  }
  const dated = p.sourceDate
    ? `from the state’s list dated ${formatDay(p.sourceDate)}`
    : 'from a state list that gives no date'
  const sentences = [
    `${state.name}’s medical frailty code list on this site has ${formatCount(p.totalEntries)} entries (version ${String(p.versionNo)}), ${dated}.`,
  ]
  const byRule = (Object.entries(p.byQualification) as [Qualification, number][])
    .filter(([, n]) => n > 0)
    .map(([q, n]) => `${qualificationLabels[q]}, ${formatCount(n)}`)
  if (byRule.length > 0) sentences.push(`Entries by the state’s rules: ${byRule.join('; ')}.`)
  if (p.updatedAt) sentences.push(`Last updated on this site ${formatDay(p.updatedAt)}.`)
  return sentences
}

export function statePage(detail: PublicStateDetail, origin: string): PageParts {
  const { state } = detail
  const p = state.published
  const url = `${origin}/states/${state.slug}`
  const sentences = summarySentences(detail)
  const description = p
    ? `${state.name}’s Medicaid medically frail code list: ${formatCount(p.totalEntries)} entries` +
      `${p.sourceDate ? `, state list dated ${formatDay(p.sourceDate)}` : ''}. Counts by code ` +
      'system and federal category, sources, version history and downloads.'
    : sentences.join(' ')

  const jsonLd: unknown[] = []
  if (p) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${state.name} medical frailty codes`,
      description,
      url,
      creator: { '@type': 'Organization', name: SITE_NAME },
      isBasedOn: detail.sources.flatMap((s) => (s.url ? [s.url] : [])),
      citation: detail.sources.map((s) => s.title),
      ...(p.updatedAt ? { dateModified: p.updatedAt } : {}),
      ...(p.sourceDate ? { temporalCoverage: `${p.sourceDate}/..` } : {}),
      spatialCoverage: { '@type': 'State', name: state.name },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: `${url}/codes.csv`,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${url}/codes.json`,
        },
      ],
    })
  }

  const notes = detail.notesMd
    ? html`<h2>Notes</h2>
        ${detail.notesMd.split(/\n\s*\n/).map((para) => html`<p>${para.trim()}</p>`)}`
    : null

  const listed = p
    ? html`<h2>What the list contains</h2>
        <p>
          An entry is one line of the state’s list: a single code, or a group of codes written with
          a wildcard or a range.
        </p>
        ${countTable('Entries by code system', p.bySystem, (k: CodeSystem) => codeSystemLabels[k])}
        ${countTable('Entries by federal category', p.byFederalCategory, (k: FederalCategory) => federalCategoryInfo[k].label)}
        ${countTable('Entries by whether a code qualifies alone', p.byQualification, (k: Qualification) => qualificationLabels[k])}
        <h2>Categories</h2>
        <p>
          How each of ${state.name}’s own categories fits the federal categories in the law. A
          mapping that is not yet confirmed is our best guess from the category’s name.
        </p>
        <table>
          <caption>
            ${state.name}’s categories
          </caption>
          <thead>
            <tr>
              <th scope="col">State category</th>
              <th scope="col">Federal category</th>
              <th scope="col">Entries</th>
              <th scope="col">Mapping</th>
            </tr>
          </thead>
          <tbody>
            ${detail.categories.map(
              (c) =>
                html`<tr>
                  <th scope="row">${categoryName(c.stateCategory, c.stateSubcategory)}</th>
                  <td>${federalCategoryInfo[c.federalCategory].label}</td>
                  <td>${formatCount(c.entries)}</td>
                  <td>${c.confirmed ? 'Confirmed' : 'Not yet confirmed'}</td>
                </tr>`,
            )}
          </tbody>
        </table>
        <h2>Sources</h2>
        <ul>
          ${detail.sources.map(
            (s) =>
              html`<li>
                ${s.url ? html`<a href="${s.url}" rel="noopener noreferrer external">${s.title}</a>` : `${s.title} (link not known)`}
                ·
                ${s.fileType.toUpperCase()}${s.publisherDate ? ` · dated ${formatDay(s.publisherDate)}` : ''}
                · retrieved ${formatDay(s.retrievedAt)}
              </li>`,
          )}
        </ul>
        <h2>Downloads</h2>
        <ul>
          <li><a href="/states/${state.slug}/codes.csv">${state.name} codes (CSV)</a></li>
          <li><a href="/states/${state.slug}/codes.json">${state.name} codes (JSON)</a></li>
        </ul>
        <h2>Version history</h2>
        <table>
          <caption>
            Version history
          </caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Published here</th>
              <th scope="col">Entries</th>
            </tr>
          </thead>
          <tbody>
            ${detail.versions.map(
              (v) =>
                html`<tr>
                  <th scope="row">${v.versionNo}</th>
                  <td>${v.status === 'published' ? 'Current' : 'Replaced'}</td>
                  <td>${v.publishedAt ? formatDay(v.publishedAt) : ''}</td>
                  <td>${formatCount(v.rowCount)}</td>
                </tr>`,
            )}
          </tbody>
        </table>`
    : null

  return {
    status: 200,
    title: pageTitles.state(state.name),
    description,
    canonical: url,
    noindex: false,
    jsonLd,
    body: html`<p><a href="/">All states</a></p>
      <h1>${state.name}</h1>
      ${sentences.map((s) => html`<p>${s}</p>`)} ${listed} ${notes}`,
  }
}

export function notFoundPage(origin: string, path: string): PageParts {
  return {
    status: 404,
    title: pageTitles.notFound,
    description: 'There is no state at this address.',
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>State not found</h1>
      <p>There is no state at this address. <a href="/">See all states</a></p>`,
  }
}

/** The tags added to <head>. */
export function headTags(parts: PageParts): Html {
  return html`
    <link rel="canonical" href="${parts.canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${parts.title}" />
    <meta property="og:description" content="${parts.description}" />
    <meta property="og:url" content="${parts.canonical}" />
    <meta name="twitter:card" content="summary" />
    ${parts.noindex ? html`<meta name="robots" content="noindex" />` : null}
    ${parts.jsonLd.map((d) => jsonLdScript(d))}
  `
}

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
    .on('head', {
      element(el) {
        el.append(headTags(parts).value, { html: true })
      },
    })
    .on('div#app', {
      element(el) {
        el.setInnerContent(parts.body.value, { html: true })
      },
    })
    .transform(new Response(indexHtml))
  return res.text()
}
