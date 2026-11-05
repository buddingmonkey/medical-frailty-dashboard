import {
  dataLastUpdated,
  learnMore,
  formatCount,
  pageTitles,
  statesCompareDescription,
  STATES_COMPARE_NOT_FOUND_DESCRIPTION,
  type PublicStateDetail,
  type PublicStateSummary,
  SIMILARITY_LABEL,
  SIMILARITY_NOTE,
  similarityText,
  STATES_COMPARE_BASIS_NOTE,
  STATES_COMPARE_DIFFERS,
  STATES_COMPARE_INTRO,
  STATES_COMPARE_MAX,
  STATES_COMPARE_MIN,
  STATES_COMPARE_NOT_FOUND_TEXT,
  STATES_COMPARE_SUMMARY_NOTE,
  statesCompareAllLabel,
  statesCompareCaption,
  statesCompareCsvPath,
  statesCompareGroupCountText,
  statesCompareGroupDiffText,
  statesCompareNames,
  statesCompareOnlyLabel,
  statesComparePath,
  type StatesCompareQuery,
  type StatesCompareResponse,
  statesCompareSearchParams,
  statesCompareSummaryText,
  statesCompareTitle,
  STATES_LANDING_DESCRIPTION,
  STATES_LANDING_HEADING,
  STATES_LANDING_INTRO,
  STATES_LANDING_OWN_HEADING,
  STATES_LANDING_OWN_LABEL,
  STATES_LANDING_PICK_HEADING,
  STATES_PICKER_LABELS,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { drillCellWords } from './drill'
import { codeLink, compareTabsHtml, describedText, learnMoreHtml, type PageParts } from './shared'
import { similarSection } from './state'

// Compare 2–4 states, its landing page and its not-found page. Moved from seo/pages.ts (2026-11-04).

/** The comparison's pickers as a GET form (`/compare/states?states=…` redirects). */
function statesPickerForm(
  choices: readonly { slug: string; name: string }[],
  currentSlugs: readonly string[] = [],
): Html {
  return html`<form method="get" action="/compare/states">
    <fieldset>
      <legend>States to compare</legend>
      ${STATES_PICKER_LABELS.slice(0, STATES_COMPARE_MAX).map((label, i) => {
        const current = currentSlugs[i]
        return html`<p>
          <label for="states-picker-${i}">${label}</label>
          <select id="states-picker-${i}" name="states">
            <option value="">${i < STATES_COMPARE_MIN ? 'Choose a state' : 'None'}</option>
            ${choices.map((c) =>
              c.slug === current
                ? html`<option value="${c.slug}" selected>${c.name}</option>`
                : html`<option value="${c.slug}">${c.name}</option>`,
            )}
          </select>
        </p>`
      })}
    </fieldset>
    <p><button type="submit">Compare</button></p>
  </form>`
}

/**
 * `/compare/states/<st>-vs-<st>…` (roadmap M5 step 7): the summary and the codes where the
 * states differ, every group expanded. Never indexed (1,275 pairs alone would be thin,
 * near-duplicate pages; the state pages carry the similarity in text); canonical to the states
 * in alphabetical order, since the order only changes the columns.
 */
export function statesComparePage(
  data: StatesCompareResponse,
  query: StatesCompareQuery,
  origin: string,
  path: string,
): PageParts {
  const names = data.states.map((s) => s.name)
  const sorted = [...data.states.map((s) => s.id)].sort()
  const applied: StatesCompareQuery = { ...query, diff: data.query.diff, page: data.page }
  const href = (change: Partial<StatesCompareQuery>) =>
    `?${statesCompareSearchParams({ ...applied, page: 1, ...change }).toString()}`
  const noList = data.states.filter((s) => !s.hasList)
  const nameOf = (id: string) => data.states.find((s) => s.id === id)?.name ?? id
  const summary = data.summary
  const description = statesCompareDescription(data)

  const head = html`<h1>${statesCompareNames(names)}</h1>
    ${compareTabsHtml(path)}
    <p>${STATES_COMPARE_INTRO}</p>
    ${statesPickerForm(
      data.choices,
      data.states.map((s) => s.slug),
    )}`

  if (!summary) {
    return {
      status: 200,
      title: statesCompareTitle(names),
      description,
      path,
      canonical: `${origin}${statesComparePath(sorted)}`,
      noindex: true,
      jsonLd: [],
      body: html`${head}
        <p>
          ${description}
          ${noList.map((s) => html`<a href="/states/${s.slug}">${s.name}’s page</a>. `)}
        </p>`,
    }
  }

  const summaryHtml = html`<h2>Summary</h2>
    <dl>
      ${data.states.map(
        (s, i) =>
          html`<dt>${statesCompareOnlyLabel(s.name)}</dt>
            <dd>${formatCount(summary.only[i] ?? 0)}</dd>`,
      )}
      <dt>${statesCompareAllLabel(data.states.length)}</dt>
      <dd>${formatCount(summary.all)}</dd>
      ${
        summary.similarity
          ? html`<dt>${SIMILARITY_LABEL}</dt>
              <dd>${similarityText(summary.similarity.jaccard)}</dd>`
          : null
      }
    </dl>
    <p>
      ${STATES_COMPARE_SUMMARY_NOTE}
      ${summary.similarity ? `${STATES_COMPARE_BASIS_NOTE} ${SIMILARITY_NOTE}` : ''}
      ${summary.similarity ? learnMoreHtml(learnMore.similarity) : null}
    </p>`

  const links = html`<p>
    ${
      data.query.diff
        ? html`<a href="${href({ diff: false })}">Show every code</a>`
        : html`<a href="${href({ diff: true })}">Show only differences</a>`
    }.
    <a href="${statesCompareCsvPath(data.states.map((s) => s.id))}">Download every code (CSV)</a>.
  </p>`

  const groupHeading = (g: StatesCompareResponse['groups'][number]) => {
    const differ = `${statesCompareGroupDiffText(g.differing, g.allRows)}${g.continued ? ', continued' : ''}`
    return g.slug
      ? html`<a href="/compare/${g.slug}">${g.label}</a> (${differ})`
      : html`${g.label} (${differ})`
  }
  const rowHeading = (r: StatesCompareResponse['groups'][number]['rows'][number]) =>
    html`${codeLink(r)}${!data.query.diff && r.differs ? ` (${STATES_COMPARE_DIFFERS.toLowerCase()})` : ''}`

  const table =
    data.groups.length === 0
      ? html`<p>These lists do not differ.</p>`
      : html`<table>
          <caption>
            ${statesCompareCaption(names, data.query.diff)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Description</th>
              ${data.states.map((s) => html`<th scope="col">${s.name}</th>`)}
            </tr>
          </thead>
          ${data.groups.map(
            (g) =>
              html`<tbody>
                <tr>
                  <th scope="rowgroup" colspan="2">${groupHeading(g)}</th>
                  ${g.counts.map((n) => html`<td>${statesCompareGroupCountText(n)}</td>`)}
                </tr>
                ${g.rows.map(
                  (r) =>
                    html`<tr>
                      <th scope="row">${rowHeading(r)}</th>
                      <td>${describedText(r, nameOf)}</td>
                      ${r.cells.map((cell) => html`<td>${drillCellWords(cell)}</td>`)}
                    </tr>`,
                )}
              </tbody>`,
          )}
        </table>`

  const pager =
    data.pageCount > 1
      ? html`<nav aria-label="Pages">
          <p>
            ${data.page > 1 ? html`<a href="${href({ page: data.page - 1 })}">Previous page</a>` : null}
            ${
              data.page < data.pageCount
                ? html`<a href="${href({ page: data.page + 1 })}">Next page</a>`
                : null
            }
          </p>
        </nav>`
      : null

  return {
    status: 200,
    title: statesCompareTitle(names),
    description,
    path,
    canonical: `${origin}${statesComparePath(sorted)}`,
    noindex: true,
    jsonLd: [],
    body: html`${head} ${summaryHtml} ${links}
      <p>
        ${statesCompareSummaryText({
          totalRows: data.totalRows,
          totalGroups: data.totalGroups,
          page: data.page,
          pageCount: data.pageCount,
          diff: data.query.diff,
        })}
      </p>
      ${table} ${pager}`,
  }
}

export function statesCompareNotFoundPage(
  origin: string,
  path: string,
  reason = 'There is no comparison at this address.',
): PageParts {
  return {
    status: 404,
    title: pageTitles.statesCompareNotFound,
    description: STATES_COMPARE_NOT_FOUND_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    body: html`<h1>Comparison not found</h1>
      ${compareTabsHtml(path)}
      <p>
        ${reason} ${STATES_COMPARE_NOT_FOUND_TEXT}
        <a href="/compare/states/ga-vs-ne">/compare/states/ga-vs-ne</a>.
        <a href="/compare/states">Choose states to compare</a>
      </p>`,
  }
}

/**
 * `/compare/states`, the States side by side tab: "Your state" as a GET form (`?state=ga`
 * shows its most similar states, the state page's section) and the comparison's pickers as a
 * GET form (`?states=…` redirects to the comparison). Never indexed, like the comparisons: it
 * holds no facts of its own, and `?state=` repeats the state page's (docs/seo.md).
 */
export function statesLandingPage(
  items: readonly PublicStateSummary[],
  own: PublicStateDetail | null,
  origin: string,
): PageParts {
  const path = '/compare/states'
  const choices = items.filter((s) => s.published !== null)
  const ownSlug = own?.state.published ? own.state.slug : null
  const ownForm = html`<form method="get" action="${path}">
    <p>
      <label for="own-state">${STATES_LANDING_OWN_LABEL}</label>
      <select id="own-state" name="state">
        <option value="">Choose a state</option>
        ${choices.map((s) =>
          s.slug === ownSlug
            ? html`<option value="${s.slug}" selected>${s.name}</option>`
            : html`<option value="${s.slug}">${s.name}</option>`,
        )}
      </select>
      <button type="submit">Show similar states</button>
    </p>
  </form>`
  const pickers =
    choices.length < STATES_COMPARE_MIN
      ? html`<p>Fewer than 2 states have a list on this site yet.</p>`
      : html`<h2>${STATES_LANDING_OWN_HEADING}</h2>
          ${ownForm} ${own && ownSlug ? similarSection(own.state, own.similar) : null}
          <h2>${STATES_LANDING_PICK_HEADING}</h2>
          ${statesPickerForm(choices)}`
  return {
    status: 200,
    title: pageTitles.statesLanding,
    description: STATES_LANDING_DESCRIPTION,
    path,
    canonical: `${origin}${path}`,
    noindex: true,
    jsonLd: [],
    dataUpdatedAt: dataLastUpdated(items),
    body: html`<h1>${STATES_LANDING_HEADING}</h1>
      ${compareTabsHtml(path)}
      <p>${STATES_LANDING_INTRO}</p>
      ${pickers}`,
  }
}
