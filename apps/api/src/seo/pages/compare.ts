import {
  codeSystemLabels,
  codeSystems,
  COMPARE_ALONE_LABEL,
  COMPARE_DESCRIPTION,
  COMPARE_STATES,
  COMPARE_HEADING,
  COMPARE_INTRO,
  compareEmptyText,
  compareCellText,
  compareFiledUnder,
  compareQualificationText,
  type CompareQuery,
  type CompareResult,
  compareSearchParams,
  compareSubject,
  downloadTableText,
  federalCategories,
  federalCategoryInfo,
  formatCount,
  pageTitles,
  STATE_CATEGORY_PREFIX,
} from '@mfcd/shared'

import { Html, html } from '../html'
import { codeLink, compareTabsHtml, describedText, legendHtml, type PageParts } from './shared'

// Compare by category. Moved from seo/pages.ts (2026-11-04).

/** `/compare/codes.csv?…` for a selection: every row, so no page. */
export const compareCsvPath = (query: CompareQuery) =>
  `/compare/codes.csv?${compareSearchParams({ ...query, page: 1 }).toString()}`

/** What the no-JavaScript form shows as chosen, read from the URL even when it is not valid. */
export interface CompareFormValues {
  states: readonly string[]
  category: string
  system: string
  alone: boolean
  /** The URL compares a state's own category, which the one-step form cannot pick. */
  own: boolean
}

const selected = (on: boolean) => new Html(on ? 'selected' : '')
const checked = (on: boolean) => new Html(on ? 'checked' : '')

const statutory = federalCategories.filter((c) => federalCategoryInfo[c].statuteClause !== null)
const nonStatutory = federalCategories.filter((c) => federalCategoryInfo[c].statuteClause === null)

/**
 * The Vue page's choices as a GET form (project lead, 2026-11-13): a federal category, the code
 * system, the states with a list and the "alone" filter. The checkboxes send `states=` once each;
 * the route redirects that to one sorted parameter. A state's own category needs a second step
 * (its categories depend on the state), so it is left to the Vue page and the state pages.
 */
function compareForm(choices: readonly { id: string; name: string }[], v: CompareFormValues): Html {
  const option = (c: (typeof federalCategories)[number]) =>
    html`<option value="${c}" ${selected(v.category === c)}>
      ${federalCategoryInfo[c].label}
    </option>`
  return html`<form method="get" action="/compare/codes">
    ${v.own ? html`<p>${COMPARE_STATES.ownNoJs}</p>` : null}
    <p>
      <label for="compare-federal">Federal category</label>
      <select id="compare-federal" name="category">
        <option value="" ${selected(v.category === '')}>Choose a category</option>
        <optgroup label="In the law">${statutory.map(option)}</optgroup>
        <optgroup label="Not in the law">${nonStatutory.map(option)}</optgroup>
      </select>
    </p>
    <p>
      <label for="compare-system">Code system</label>
      <select id="compare-system" name="system">
        <option value="" ${selected(v.system === '')}>All code systems</option>
        ${codeSystems.map(
          (sys) =>
            html`<option value="${sys}" ${selected(v.system === sys)}>
              ${codeSystemLabels[sys]}
            </option>`,
        )}
      </select>
    </p>
    <fieldset>
      <legend>${COMPARE_STATES.legend}</legend>
      ${
        choices.length === 0
          ? html`<p>${COMPARE_STATES.noList}</p>`
          : html`<ul>
              ${choices.map(
                (c) =>
                  html`<li>
                    <label
                      ><input
                        type="checkbox"
                        name="states"
                        value="${c.id}"
                        ${checked(v.states.includes(c.id))}
                      />
                      ${c.name}</label
                    >
                  </li>`,
              )}
            </ul>`
      }
    </fieldset>
    <p>
      <label
        ><input type="checkbox" name="alone" value="1" ${checked(v.alone)} />
        ${COMPARE_ALONE_LABEL}</label
      >
    </p>
    <p><button type="submit">${COMPARE_STATES.submit}</button></p>
  </form>`
}

/**
 * `/compare/codes`: never indexed (each combination is a view of facts whose home is the state
 * page), canonical to the bare `/compare/codes`. Renders the table for the selection in the
 * URL, if any.
 */
export function comparePage(
  origin: string,
  view: { query: CompareQuery; result: CompareResult } | { error: string } | null,
  form: { choices: readonly { id: string; name: string }[]; values: CompareFormValues },
): PageParts {
  const intro = html`<h1>${COMPARE_HEADING}</h1>
    ${compareTabsHtml('/compare/codes')}
    <p>${COMPARE_INTRO}</p>
    ${compareForm(form.choices, form.values)}`
  let body: Html
  if (view === null) {
    body = html`${intro}
      <p>Pick a category and at least one state to see the table.</p>`
  } else if ('error' in view) {
    body = html`${intro}
      <p>${view.error}</p>`
  } else {
    const { query, result } = view
    const names = new Map(result.states.map((s) => [s.id, s.name]))
    const subject = compareSubject(query, (id) => names.get(id) ?? id)
    const stateName = (id: string) => names.get(id) ?? id
    const table =
      result.totalRows === 0
        ? html`<p>${compareEmptyText(query.alone)}</p>`
        : html`<table>
            <caption>
              ${subject}: codes by state
            </caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Description</th>
                ${result.states.map((s) => html`<th scope="col"><a href="/states/${s.slug}">${s.name}</a></th>`)}
              </tr>
            </thead>
            <tbody>
              ${result.rows.map(
                (row) =>
                  html`<tr>
                    <th scope="row">${codeLink(row)}</th>
                    <td>${describedText(row, stateName)}</td>
                    ${row.cells.map((cell, i) => {
                      const stateId = result.states[i]?.id ?? ''
                      const m = cell.match
                      const filed = m ? compareFiledUnder(query, stateId, m) : null
                      const text = [
                        compareCellText(cell),
                        m?.tier,
                        m ? compareQualificationText(m) : null,
                        filed ? `${STATE_CATEGORY_PREFIX} ${filed}` : null,
                      ]
                        .filter((part) => part !== null && part !== undefined && part !== '')
                        .join('; ')
                      return html`<td>${text}</td>`
                    })}
                  </tr>`,
              )}
            </tbody>
          </table>`
    body = html`${intro}
      <h2>${subject}: codes by state</h2>
      <p>
        ${formatCount(result.totalRows)} codes, page ${result.page} of ${result.pageCount}.
        ${result.totalRows > 0 ? html`<a href="${compareCsvPath(query)}">${downloadTableText(result.totalRows)}</a>` : null}
      </p>
      ${table} ${legendHtml()}`
  }
  return {
    status: 200,
    title: pageTitles.compare,
    description: COMPARE_DESCRIPTION,
    path: '/compare/codes',
    canonical: `${origin}/compare/codes`,
    noindex: true,
    jsonLd: [],
    body,
  }
}
