import { type CodeSystem, codeSystemSchema } from './enums'
import { SITE_NAME } from './public'
import { CODE_SEARCH_MAX_Q, CODE_SEARCH_NOT_LISTED } from './search'

// The search page (roadmap M6 step 2): `/search?q=&states=&system=`. What the URL holds, when
// the page asks the API, and every word on the page. The wording is provisional and on the legal
// team's list (docs/legal-review.md, Part 2); change it here, never in the component.

/** Fewer characters than this ask nothing: one letter matches too much to be useful. */
export const SEARCH_MIN_CHARS = 2
/** How long typing must pause before the page searches. */
export const SEARCH_DEBOUNCE_MS = 250

export interface SearchPageQuery {
  q: string
  /** State slugs, lowercase, each once. */
  states: string[]
  system: CodeSystem | null
}

const SLUG = /^[a-z]{2}$/

/** The first string of a route query value (`?q=a&q=b` reads `a`). */
function first(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const found: unknown = value.find((v) => typeof v === 'string')
    return typeof found === 'string' ? found : ''
  }
  return ''
}

/** Reads the URL's query. Anything it cannot read is left out, never an error. */
export function searchPageQuery(query: {
  q?: unknown
  states?: unknown
  system?: unknown
}): SearchPageQuery {
  const states: string[] = []
  for (const part of first(query.states).split(',')) {
    const slug = part.trim().toLowerCase()
    if (SLUG.test(slug) && !states.includes(slug)) states.push(slug)
  }
  const system = codeSystemSchema.safeParse(first(query.system))
  return {
    q: first(query.q).trim().slice(0, CODE_SEARCH_MAX_Q),
    states,
    system: system.success ? system.data : null,
  }
}

/** The URL's query for a search: only what is set. */
export function searchPageParams(query: SearchPageQuery): {
  q?: string
  states?: string
  system?: string
} {
  const params: { q?: string; states?: string; system?: string } = {}
  const q = query.q.trim()
  if (q !== '') params.q = q
  if (query.states.length > 0) params.states = query.states.join(',')
  if (query.system) params.system = query.system
  return params
}

/** True when the text is long enough to search. */
export function searchReady(q: string): boolean {
  return q.trim().length >= SEARCH_MIN_CHARS
}

// ---------------------------------------------------------------------------------------------
// Words

export const SEARCH_PAGE = {
  title: `Search codes | ${SITE_NAME}`,
  heading: 'Search codes',
  intro:
    'Find a diagnosis or service code and see which states list it as a sign of medical ' +
    'frailty. Type a code number or words from its description.',
  inputLabel: 'Code number or words',
  filtersLabel: 'Filters',
  systemLabel: 'Code system',
  anySystem: 'Any code system',
  statesLegend: 'States',
  statesHelp: 'Show only codes that the states you choose list. Choose none to search them all.',
  statesNone: 'All states',
  statesChosen: (n: number) => `${String(n)} chosen`,
  statesLoading: 'Loading the list of states…',
  resultsLabel: 'Search results',
  idle: 'Type at least 2 characters. Try a code number like F20.0, or a word like schizophrenia.',
  loading: 'Searching…',
  error: 'The search could not be finished. Wait a minute, then try again.',
  badFilter: 'This link has a filter the search cannot use. Remove the filters, then search again.',
  noDescription: 'No description on this site',
} as const

export function searchCountText(count: number, limit: number): string {
  if (count >= limit) {
    return (
      `Showing the first ${String(count)} codes. There may be more: add a word or a filter to ` +
      'narrow the search.'
    )
  }
  return count === 1 ? '1 code found.' : `${String(count)} codes found.`
}

export function searchEmptyText(q: string, filtered: boolean): string {
  const tip = 'Try a code number like F20.0, or a word like schizophrenia.'
  return filtered
    ? `No codes match “${q}” with these filters. Check the spelling, remove a filter, or ${tip.charAt(0).toLowerCase()}${tip.slice(1)}`
    : `No codes match “${q}”. ${tip}`
}

/** Shown under a description that is a state's own text (CPT codes, and codes CMS has no text for). */
export function searchTextBy(stateName: string): string {
  return `Text published by ${stateName}`
}

/**
 * "Listed by 2 of 4 states with a list on this site: Georgia, Montana." `total` is the number of
 * states with a published list here; null while that is not known yet.
 */
export function searchListedByText(count: number, total: number | null, names: string[]): string {
  if (count === 0) return `${CODE_SEARCH_NOT_LISTED}.`
  const list = names.length > 0 ? `: ${names.join(', ')}` : ''
  if (total === null) {
    return `Listed by ${String(count)} ${count === 1 ? 'state' : 'states'} on this site${list}.`
  }
  const noun = total === 1 ? 'state' : 'states'
  return `Listed by ${String(count)} of ${String(total)} ${noun} with a list on this site${list}.`
}
