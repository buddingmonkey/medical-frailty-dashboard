import {
  CODE_DETAIL_CONFIRMED,
  CODE_DETAIL_NO_DESCRIPTION,
  CODE_DETAIL_NOT_FOUND,
  CODE_DETAIL_OTHERS,
  type CodeDetailEntry,
  type CodeDetailResponse,
  type CodeDetailState,
  codeDetailColumns,
  codeDetailDescriptionNote,
  codeDetailGroups,
  codeDetailIndexed,
  codeDetailMetaDescription,
  codeDetailNarrowerText,
  codeDetailPageTitle,
  codeDetailStateName,
  codeDetailSummary,
  codeDetailUpdatedText,
  codeSystemLabels,
  codeSystemSetUrls,
  compareQualificationText,
  descriptionSourceText,
  formatDay,
  LIKE_CODES,
  likeCodeGroupsText,
  likeCodeMoreText,
  SEARCH_PAGE,
  SITE_NAME,
  stateCategoryName,
} from '@mfcd/shared'

import { Html, html } from './html'
import type { PageParts } from './pages'

// The code page as plain semantic HTML (roadmap M6 step 5; docs/seo.md): the same facts and
// words as the Vue page (apps/web/src/pages/codes/[system]/[code].vue), from the same loader
// (`publicCode`) and the same shared wording (packages/shared/src/code-detail.ts and
// condition-groups.ts). Indexed only when a published state includes the code.

/** The state's document, its date and where in it, as in the Vue table. */
function sourceHtml(source: CodeDetailEntry['source']): Html {
  return html`${
    source.url
      ? html`<a href="${source.url}" rel="noopener noreferrer external">${source.title}</a>`
      : source.title
  }${source.publisherDate ? html`<br />${formatDay(source.publisherDate)}` : null}${
    source.locator ? html`<br />${source.locator}` : null
  }`
}

const stateLink = (s: Pick<CodeDetailState, 'slug' | 'name'>) =>
  html`<a href="/states/${s.slug}">${s.name}</a>`

/** An "Included" group: one row per entry, the state's cell spanning its entries. */
function includedTable(heading: string, states: readonly CodeDetailState[], showRule: boolean) {
  return html`<table>
    <caption>
      ${heading}
    </caption>
    <thead>
      <tr>
        <th scope="col">${codeDetailColumns.state}</th>
        <th scope="col">${codeDetailColumns.entry}</th>
        <th scope="col">${codeDetailColumns.description}</th>
        <th scope="col">${codeDetailColumns.category}</th>
        <th scope="col">${codeDetailColumns.tier}</th>
        ${showRule ? html`<th scope="col">${codeDetailColumns.rule}</th>` : null}
        <th scope="col">${codeDetailColumns.source}</th>
      </tr>
    </thead>
    <tbody>
      ${states.flatMap((s) =>
        s.entries.map(
          (e, i) =>
            html`<tr>
              ${
                i === 0
                  ? html`<th scope="row" rowspan="${s.entries.length}">${stateLink(s)}</th>`
                  : null
              }
              <td>${e.rawCode}${e.display !== e.rawCode ? html`<br />(${e.display})` : null}</td>
              <td>${e.description ?? CODE_DETAIL_NO_DESCRIPTION}</td>
              <td>${stateCategoryName(e.stateCategory, e.stateSubcategory)}</td>
              <td>${e.tier ?? ''}</td>
              ${
                showRule
                  ? html`<td>
                      ${
                        e.qualification && e.qualificationBasis
                          ? compareQualificationText({
                              qualification: e.qualification,
                              qualificationBasis: e.qualificationBasis,
                            })
                          : ''
                      }
                    </td>`
                  : null
              }
              <td>${sourceHtml(e.source)}</td>
            </tr>`,
        ),
      )}
    </tbody>
  </table>`
}

/** Like codes (M6 step 4), in a section of their own, as `LikeCodes.vue`. */
function likeCodesHtml(detail: CodeDetailResponse): Html | null {
  const rows = detail.states.flatMap((s) =>
    (s.likeCodes ?? []).flatMap((match) => [
      ...match.entries.map((entry) => ({ s, match, entry })),
      ...(match.total > match.entries.length ? [{ s, match, entry: null }] : []),
    ]),
  )
  if (rows.length === 0) return null
  const count = new Map<string, number>()
  for (const r of rows) count.set(r.s.id, (count.get(r.s.id) ?? 0) + 1)
  const seen = new Set<string>()
  return html`<section aria-labelledby="like-codes-heading">
    <h2 id="like-codes-heading">${LIKE_CODES.heading}</h2>
    <p>${LIKE_CODES.help}</p>
    <p>${likeCodeGroupsText((detail.conditionGroups ?? []).map((g) => g.name))}</p>
    <p>${LIKE_CODES.note}</p>
    <table>
      <caption>
        ${LIKE_CODES.heading}
      </caption>
      <thead>
        <tr>
          <th scope="col">State</th>
          <th scope="col">Condition group</th>
          <th scope="col">State’s code</th>
          <th scope="col">State’s description</th>
          <th scope="col">State’s category</th>
          <th scope="col">Source</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const first = !seen.has(r.s.id)
          seen.add(r.s.id)
          return html`<tr>
            ${
              first
                ? html`<th scope="row" rowspan="${count.get(r.s.id) ?? 1}">${stateLink(r.s)}</th>`
                : null
            }
            <td>${r.match.group.name}</td>
            ${
              r.entry
                ? html`<td>${r.entry.display}<br />${codeSystemLabels[r.entry.codeSystem]}</td>
                    <td>${r.entry.description ?? 'No description published'}</td>
                    <td>${stateCategoryName(r.entry.stateCategory, r.entry.stateSubcategory)}</td>
                    <td>${sourceHtml(r.entry.source)}</td>`
                : html`<td colspan="4">
                    ${likeCodeMoreText(r.match.total - r.match.entries.length)}
                  </td>`
            }
          </tr>`
        })}
      </tbody>
    </table>
  </section>`
}

/** JSON-LD: the page (with `dateModified`) about the code as a `DefinedTerm` (docs/seo.md). */
function codeJsonLd(
  detail: CodeDetailResponse,
  url: string,
  title: string,
  description: string,
  updatedAt: string | null,
): unknown {
  const { code } = detail
  const stateText = code.description === null ? codeDetailStateName(detail.states) : null
  const setUrl = codeSystemSetUrls[code.codeSystem]
  const term = {
    '@type': 'DefinedTerm',
    termCode: code.display,
    ...(code.description !== null
      ? { name: code.description }
      : stateText
        ? {
            name: stateText.text,
            disambiguatingDescription: `${descriptionSourceText(stateText.stateName)} (${stateText.sourceTitle})`,
          }
        : {}),
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: codeSystemLabels[code.codeSystem],
      ...(setUrl ? { url: setUrl } : {}),
    },
    url,
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url,
    publisher: { '@type': 'Organization', name: SITE_NAME },
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    mainEntity: term,
  }
}

export function codePage(
  detail: CodeDetailResponse,
  origin: string,
  updatedAt: string | null,
): PageParts {
  const { code } = detail
  const url = `${origin}${code.path}`
  const title = codeDetailPageTitle(code, detail.states)
  const description = codeDetailMetaDescription(code, detail.states)
  const summary = codeDetailSummary(code, detail.states)
  const groups = codeDetailGroups(detail.states)
  const showRule = detail.showQualification !== 'none'
  const parts = [
    { id: 'confirmed', ...CODE_DETAIL_CONFIRMED, groups: groups.filter((g) => g.confirmed) },
    { id: 'others', ...CODE_DETAIL_OTHERS, groups: groups.filter((g) => !g.confirmed) },
  ].filter((p) => p.groups.length > 0)

  return {
    status: 200,
    path: code.path,
    title,
    description,
    canonical: url,
    noindex: !codeDetailIndexed(detail.states),
    jsonLd: [codeJsonLd(detail, url, title, description, updatedAt)],
    body: html`<p><a href="/search">${SEARCH_PAGE.heading}</a></p>
      <article>
        <p>${codeSystemLabels[code.codeSystem]}</p>
        <h1>${code.description ? `${code.display} ${code.description}` : code.display}</h1>
        <p>${codeDetailDescriptionNote(code.codeSystem, code.description !== null)}</p>
        <section aria-label="Summary">
          <p>${summary.count}</p>
          ${summary.parts.map(
            (p) =>
              html`<ul aria-label="${p.heading}">
                ${p.sentences.map((s) => html`<li>${s}</li>`)}
              </ul>`,
          )}
          ${updatedAt ? html`<p>${codeDetailUpdatedText(updatedAt)}</p>` : null}
        </section>
        ${parts.map(
          (part) =>
            html`<section aria-labelledby="${part.id}-heading">
              <h2 id="${part.id}-heading">${part.heading}</h2>
              <p>${part.help}</p>
              ${part.groups.map(
                (g) =>
                  html`<section aria-labelledby="group-${g.status}">
                    <h3 id="group-${g.status}">${g.heading} (${g.states.length})</h3>
                    <p>${g.help}</p>
                    ${
                      g.confirmed
                        ? includedTable(g.heading, g.states, showRule)
                        : html`<ul aria-label="${g.heading}">
                            ${g.states.map(
                              (s) =>
                                html`<li>
                                  ${stateLink(s)}${
                                    g.status === 'narrower'
                                      ? `: ${codeDetailNarrowerText(s.narrowerCount)}`
                                      : ''
                                  }
                                </li>`,
                            )}
                          </ul>`
                    }
                  </section>`,
              )}
            </section>`,
        )}
        ${likeCodesHtml(detail)}
      </article>`,
  }
}

/** A code no CMS file and no state has, or a malformed address: 404, never indexed. */
export function codeNotFoundPage(origin: string, path: string): PageParts {
  return {
    status: 404,
    path,
    title: CODE_DETAIL_NOT_FOUND.title,
    description: CODE_DETAIL_NOT_FOUND.body,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>${CODE_DETAIL_NOT_FOUND.heading}</h1>
      <p>${CODE_DETAIL_NOT_FOUND.body} <a href="/compare">Compare states</a></p>`,
  }
}

/** `/search` (M6 step 2): the search runs in the browser, so the HTML only says what it is. */
export function searchPage(origin: string): PageParts {
  return {
    status: 200,
    path: '/search',
    title: SEARCH_PAGE.title,
    description: SEARCH_PAGE.intro,
    canonical: `${origin}/search`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>${SEARCH_PAGE.heading}</h1>
      <p>${SEARCH_PAGE.intro}</p>`,
  }
}
