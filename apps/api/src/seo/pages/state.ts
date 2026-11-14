import {
  ADDED_HEADING,
  learnMore,
  REPORT_LIST_LINK_TEXT,
  REPORT_PROBLEM_URL,
  reportListText,
  type CodeSystem,
  codeSystemLabels,
  ENTRY_DEFINITION,
  type FederalCategory,
  FEDERAL_OVERLAP_NOTE,
  federalCategoryInfo,
  federalCountsOverlap,
  formatCount,
  formatDay,
  noListText,
  pageTitles,
  stateDescription,
  type PublicStateDetail,
  type Qualification,
  qualificationLabels,
  REVIEW_STATUS_HEADING,
  reviewStatusText,
  SITE_NAME,
  sourceDetailsText,
  STATE_COUNT_CAPTIONS,
  stateCategoriesIntro,
  stateCategoryName,
  SIMILAR_PICK_MAX,
  type SimilarState,
  SIMILARITY_NOTE,
  similarityText,
  statesComparePath,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { linkHtml } from '../info-page'
import { markdownHtml } from '../markdown-html'
import { learnMoreHtml, type PageParts } from './shared'

// A state page (`/states/:slug`). Moved from seo/pages.ts (2026-11-04).

export const downloadName = (slug: string, versionNo: number, ext: 'csv' | 'json') =>
  `${slug}-medical-frailty-codes-v${String(versionNo)}.${ext}`

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

const categoryName = stateCategoryName

/** The answer in plain sentences, near the top (docs/seo.md, "Facts that AI can quote"). */
function summarySentences(detail: PublicStateDetail): string[] {
  const { state } = detail
  const p = state.published
  if (!p) return [noListText(state.name, state.status === 'announced')]
  const dated = p.sourceDate
    ? `from the state’s document dated ${formatDay(p.sourceDate)}`
    : 'from a state document that gives no date'
  const sentences = [
    `${state.name}’s medical frailty code list on this site has ${formatCount(p.totalEntries)} entries (version ${String(p.versionNo)}), ${dated}.`,
  ]
  const byRule = (Object.entries(p.byQualification) as [Qualification, number][])
    .filter(([, n]) => n > 0)
    .map(([q, n]) => `${qualificationLabels[q]}, ${formatCount(n)}`)
  if (byRule.length > 0) sentences.push(`${STATE_COUNT_CAPTIONS.rule}: ${byRule.join('; ')}.`)
  if (p.updatedAt) sentences.push(`Last updated on this site ${formatDay(p.updatedAt)}.`)
  return sentences
}

export function statePage(detail: PublicStateDetail, origin: string): PageParts {
  const { state } = detail
  const p = state.published
  const url = `${origin}/states/${state.slug}`
  const sentences = summarySentences(detail)
  const description = stateDescription(state)

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
        ${markdownHtml(detail.notesMd, 2)}`
    : null

  const listed = p
    ? html`<h2>What the list contains</h2>
        <p>${ENTRY_DEFINITION}</p>
        ${countTable(STATE_COUNT_CAPTIONS.system, p.bySystem, (k: CodeSystem) => codeSystemLabels[k])}
        ${countTable(STATE_COUNT_CAPTIONS.federal, p.byFederalCategory, (k: FederalCategory) => federalCategoryInfo[k].label)}
        ${federalCountsOverlap(p) ? html`<p>${FEDERAL_OVERLAP_NOTE}</p>` : null}
        ${countTable(STATE_COUNT_CAPTIONS.rule, p.byQualification, (k: Qualification) => qualificationLabels[k])}
        <h2>Categories</h2>
        <p>${stateCategoriesIntro(state.name)} ${learnMoreHtml(learnMore.stateCategories)}</p>
        <table>
          <caption>
            ${state.name}’s categories
          </caption>
          <thead>
            <tr>
              <th scope="col">State category</th>
              <th scope="col">Federal category</th>
              <th scope="col">Entries</th>
              <th scope="col">${REVIEW_STATUS_HEADING}</th>
            </tr>
          </thead>
          <tbody>
            ${detail.categories.map(
              (c) =>
                html`<tr>
                  <th scope="row">${categoryName(c.stateCategory, c.stateSubcategory)}</th>
                  <td>${federalCategoryInfo[c.federalCategory].label}</td>
                  <td>${formatCount(c.entries)}</td>
                  <td>${reviewStatusText(c.confirmed, c.stated)}</td>
                </tr>`,
            )}
          </tbody>
        </table>
        ${similarSection(state, detail.similar)}
        <h2>Sources</h2>
        <ul>
          ${detail.sources.map(
            (s) =>
              html`<li>
                ${s.url ? html`<a href="${s.url}" rel="noopener noreferrer external">${s.title}</a>` : `${s.title} (link not known)`}
                · ${sourceDetailsText(s)}
              </li>`,
          )}
        </ul>
        <h2>Downloads</h2>
        <ul>
          <li><a href="/states/${state.slug}/codes.csv">${state.name} codes (CSV)</a></li>
          <li><a href="/states/${state.slug}/codes.json">${state.name} codes (JSON)</a></li>
        </ul>
        <p>${learnMoreHtml(learnMore.downloads)}</p>
        <h2>Version history</h2>
        <table>
          <caption>
            Version history
          </caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">${ADDED_HEADING}</th>
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
    path: `/states/${state.slug}`,
    canonical: url,
    noindex: false,
    jsonLd,
    body: html`<p><a href="/states">All states</a></p>
      <h1>${state.name}</h1>
      ${sentences.map((s) => html`<p>${s}</p>`)}
      ${
        p
          ? null
          : html`<p>
              ${reportListText(state.name)}
              ${linkHtml({ text: REPORT_LIST_LINK_TEXT, href: REPORT_PROBLEM_URL })}
            </p>`
      }
      ${listed} ${notes}`,
  }
}

/**
 * "States with the most similar lists" (roadmap M5 step 7): each with its similarity and a link
 * to the pair, and a GET form that works without JavaScript (`/compare/states?states=…`
 * redirects to the comparison).
 */
export function similarSection(
  state: { id: string; slug: string; name: string },
  similar: readonly SimilarState[],
): Html {
  return html`<h2>States with the most similar lists</h2>
    <p>${SIMILARITY_NOTE} ${learnMoreHtml(learnMore.similarity)}</p>
    ${
      similar.length === 0
        ? html`<p>No other state has a list to compare with yet.</p>`
        : html`<form method="get" action="/compare/states">
            <input type="hidden" name="states" value="${state.slug}" />
            <ul>
              ${similar.map(
                (s) =>
                  html`<li>
                    <input type="checkbox" name="states" value="${s.slug}" id="similar-${s.slug}" />
                    <label for="similar-${s.slug}">${s.name}</label>
                    Similarity ${similarityText(s.jaccard)} ·
                    <a href="${statesComparePath([state.id, s.id])}">Compare with ${s.name}</a>
                  </li>`,
              )}
            </ul>
            <p>
              <button type="submit">Compare ${state.name} with the chosen states</button>
              Choose up to ${SIMILAR_PICK_MAX}.
            </p>
          </form>`
    }`
}
