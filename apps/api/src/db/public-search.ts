import {
  type CodeSearchQuery,
  type CodeSearchResponse,
  type CodeSearchResult,
  type CodeSystem,
  codeUrlPath,
  formatCode,
  ftsMatchExpression,
  parseSearchInput,
  type SearchInput,
} from '@mfcd/shared'

// Code search (roadmap M6 step 1; docs/architecture.md, `/api/public/codes/search`). Two D1
// round trips of indexed queries, whatever the size of the lists:
//   1. the states, and the candidate codes: a code prefix through the primary key of
//      `ref_codes` and `entries_code_idx`, or words through `ref_codes_fts` (CMS text) and
//      `entries_fts` (the states' own published text, the only way CPT text is searched);
//   2. for at most `limit` codes, the published entries that list them and their CMS text.
// Lists are bound as one JSON array (`json_each`), so D1's 100 parameters are never reached.
// src/db/public-search.test.ts checks every statement's query plan: no scan of ref_codes or
// entries.

/** The systems with CMS reference text in `ref_codes`. */
const REF_SYSTEMS = ['icd10cm', 'hcpcs'] as const satisfies readonly CodeSystem[]

/** Above every code character, so `[prefix, prefix + HIGH)` is the range of codes it starts. */
const HIGH = '￿'

export interface Statement {
  sql: string
  params: (string | number)[]
}

/** The published versions: of the states in `states` (a JSON array of slugs), or all of them. */
const PUBLISHED_VERSIONS = `(SELECT published_version_id FROM states
    WHERE published_version_id IS NOT NULL
      AND (json_array_length(?) = 0 OR slug IN (SELECT value FROM json_each(?))))`

const refSystemsFor = (query: CodeSearchQuery, input: SearchInput): CodeSystem[] =>
  REF_SYSTEMS.filter(
    (s) =>
      (query.system === null || query.system === s) &&
      (input.kind === 'words' || input.systems === null || input.systems.includes(s)),
  )

/**
 * The candidate statements for one request. Each returns `code_system`, `code_norm` and, for
 * words, `score` (bm25, lower is better). Exported for the query-plan test.
 */
export function candidateStatements(query: CodeSearchQuery, input: SearchInput): Statement[] {
  const states = JSON.stringify(query.states)
  const statements: Statement[] = []
  // Fetched per source; the merge keeps `limit`. Entries may repeat a code across states, so the
  // entry statements group by code.
  const limit = query.limit
  const systemFilter = (column: string): { sql: string; params: string[] } =>
    query.system === null
      ? { sql: '', params: [] }
      : { sql: ` AND ${column} = ?`, params: [query.system] }

  if (input.kind === 'code') {
    const end = input.prefix + HIGH
    // With a state filter every candidate is an entry of those states: the entry query is enough.
    if (query.states.length === 0) {
      for (const system of refSystemsFor(query, input)) {
        statements.push({
          sql: `SELECT DISTINCT code_system, code_norm FROM ref_codes
                WHERE code_system = ? AND code_norm >= ? AND code_norm < ?
                ORDER BY code_norm LIMIT ?`,
          params: [system, input.prefix, end, limit],
        })
      }
    }
    const systems =
      input.systems === null
        ? { sql: '', params: [] }
        : {
            sql: ' AND e.code_system IN (SELECT value FROM json_each(?))',
            params: [JSON.stringify(input.systems)],
          }
    const system = systemFilter('e.code_system')
    statements.push({
      sql: `SELECT DISTINCT e.code_system, e.code_norm FROM entries e
            WHERE e.code_norm >= ? AND e.code_norm < ? AND e.match_kind = 'exact'
              AND e.version_id IN ${PUBLISHED_VERSIONS}${systems.sql}${system.sql}
            ORDER BY e.code_norm LIMIT ?`,
      params: [input.prefix, end, states, states, ...systems.params, ...system.params, limit],
    })
    return statements
  }

  const refMatch = ftsMatchExpression(input.tokens, 'description')
  const entryMatch = ftsMatchExpression(input.tokens, 'description_published')
  if (!refMatch || !entryMatch) return []

  const refSystems = refSystemsFor(query, input)
  if (refSystems.length > 0) {
    const listed =
      query.states.length === 0
        ? { sql: '', params: [] }
        : {
            sql: ` AND EXISTS (SELECT 1 FROM entries e
                     WHERE e.version_id IN ${PUBLISHED_VERSIONS}
                       AND e.code_norm = f.code_norm AND e.code_system = f.code_system
                       AND e.match_kind = 'exact')`,
            params: [states, states],
          }
    statements.push({
      sql: `WITH m AS MATERIALIZED (
              SELECT f.code_system, f.code_norm, bm25(ref_codes_fts) AS score FROM ref_codes_fts f
              WHERE ref_codes_fts MATCH ?
                AND f.code_system IN (SELECT value FROM json_each(?))${listed.sql})
            SELECT code_system, code_norm, min(score) AS score, 'cms' AS source FROM m
            GROUP BY code_system, code_norm ORDER BY score, code_norm LIMIT ?`,
      params: [refMatch, JSON.stringify(refSystems), ...listed.params, limit],
    })
  }

  const system = systemFilter('e.code_system')
  statements.push({
    sql: `WITH m AS MATERIALIZED (
            SELECT e.code_system, e.code_norm, bm25(entries_fts) AS score
            FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid
            WHERE entries_fts MATCH ? AND e.match_kind = 'exact'
              AND e.version_id IN ${PUBLISHED_VERSIONS}${system.sql})
          SELECT code_system, code_norm, min(score) AS score, 'state' AS source FROM m
          GROUP BY code_system, code_norm ORDER BY score, code_norm LIMIT ?`,
    params: [entryMatch, states, states, ...system.params, limit],
  })
  return statements
}

/** The details of the chosen codes: every published listing, and the CMS text. */
export function detailStatements(codeNorms: readonly string[]): Statement[] {
  const norms = JSON.stringify(codeNorms)
  return [
    {
      sql: `SELECT e.id, e.code_system, e.code_norm, e.version_id, e.description_published
            FROM entries e INDEXED BY entries_code_idx
            WHERE e.code_norm IN (SELECT value FROM json_each(?)) AND e.match_kind = 'exact'
              AND e.version_id IN (SELECT published_version_id FROM states
                                   WHERE published_version_id IS NOT NULL)`,
      params: [norms],
    },
    {
      sql: `SELECT code_system, code_norm, description, valid_from, valid_to FROM ref_codes
            WHERE code_system IN (SELECT value FROM json_each(?))
              AND code_norm IN (SELECT value FROM json_each(?))
            ORDER BY valid_to IS NULL, valid_from`,
      params: [JSON.stringify(REF_SYSTEMS), norms],
    },
  ]
}

const STATES_SQL = `SELECT id, slug, name, published_version_id FROM states ORDER BY slug`

interface StateRow {
  id: string
  slug: string
  name: string
  published_version_id: number | null
}
interface CandidateRow {
  code_system: CodeSystem
  code_norm: string
  score?: number
  /** Words only: the index that scored the row. */
  source?: 'cms' | 'state'
}
interface ListingRow {
  code_system: CodeSystem
  code_norm: string
  id: number
  version_id: number
  description_published: string | null
}
interface RefRow {
  code_system: CodeSystem
  code_norm: string
  description: string
}

const keyOf = (system: string, norm: string) => `${system}|${norm}`
const bind = (d1: D1Database, s: Statement) => d1.prepare(s.sql).bind(...s.params)

/** Merges the candidates of every source and keeps the best `limit` codes, in result order. */
function chooseCodes(
  input: SearchInput,
  rows: readonly CandidateRow[],
  limit: number,
): CandidateRow[] {
  const best = new Map<string, CandidateRow>()
  for (const row of rows) {
    const key = keyOf(row.code_system, row.code_norm)
    const seen = best.get(key)
    // bm25 scores of two indexes are not comparable for one code: the CMS score (of the text
    // the result shows) wins over a state's. Codes without CMS text keep their state score.
    const better =
      !seen ||
      (row.source === 'cms' && seen.source === 'state') ||
      (row.source === seen.source && (row.score ?? 0) < (seen.score ?? 0))
    if (better) best.set(key, row)
  }
  const byCode = (a: CandidateRow, b: CandidateRow) =>
    a.code_norm < b.code_norm ? -1 : a.code_norm > b.code_norm ? 1 : 0
  const bySystem = (a: CandidateRow, b: CandidateRow, primary: CodeSystem | null) =>
    Number(b.code_system === primary) - Number(a.code_system === primary) ||
    (a.code_system < b.code_system ? -1 : a.code_system > b.code_system ? 1 : 0)
  const sorted = [...best.values()].sort((a, b) =>
    input.kind === 'code'
      ? // Exact first (the prefix itself sorts first among the codes it starts), then the tree order.
        byCode(a, b) || bySystem(a, b, input.primary)
      : (a.score ?? 0) - (b.score ?? 0) || byCode(a, b) || bySystem(a, b, null),
  )
  return sorted.slice(0, limit)
}

/** The search response, or null when `states` names a state that does not exist. */
export async function publicCodeSearch(
  d1: D1Database,
  query: CodeSearchQuery,
  dataVersion: number,
): Promise<CodeSearchResponse | null> {
  const input = parseSearchInput(query.q)
  const candidates = candidateStatements(query, input)
  const [stateResult, ...candidateResults] = await d1.batch([
    d1.prepare(STATES_SQL),
    ...candidates.map((s) => bind(d1, s)),
  ])
  const allStates = (stateResult?.results ?? []) as StateRow[]
  const known = new Set(allStates.map((s) => s.slug))
  if (query.states.some((slug) => !known.has(slug))) return null

  const chosen = chooseCodes(
    input,
    candidateResults.flatMap((r) => r.results as CandidateRow[]),
    query.limit,
  )
  const response: CodeSearchResponse = {
    query: {
      q: query.q,
      kind: input.kind,
      states: query.states,
      system: query.system,
      limit: query.limit,
    },
    results: [],
    dataVersion,
  }
  if (chosen.length === 0) return response

  const norms = [...new Set(chosen.map((c) => c.code_norm))]
  const [listingResult, refResult] = await d1.batch(detailStatements(norms).map((s) => bind(d1, s)))
  const stateOfVersion = new Map<number, StateRow>()
  for (const s of allStates)
    if (s.published_version_id !== null) stateOfVersion.set(s.published_version_id, s)

  const listings = new Map<string, { states: StateRow[]; texts: Map<string, string> }>()
  // In entry order, so a state's first text for the code is the one shown (sorted here: an
  // ORDER BY e.id in SQL makes SQLite walk the whole table by rowid).
  const listingRows = [...((listingResult?.results ?? []) as ListingRow[])].sort(
    (a, b) => a.id - b.id,
  )
  for (const row of listingRows) {
    const state = stateOfVersion.get(row.version_id)
    if (!state) continue
    const key = keyOf(row.code_system, row.code_norm)
    const listing = listings.get(key) ?? { states: [], texts: new Map<string, string>() }
    if (!listing.states.includes(state)) listing.states.push(state)
    const text = row.description_published?.trim()
    if (text && !listing.texts.has(state.slug)) listing.texts.set(state.slug, text)
    listings.set(key, listing)
  }
  // Ordered current-last (valid_to NULL, then newest valid_from), so the last row read wins.
  const cms = new Map<string, string>()
  for (const row of (refResult?.results ?? []) as RefRow[]) {
    cms.set(keyOf(row.code_system, row.code_norm), row.description)
  }

  response.results = chosen.map((c): CodeSearchResult => {
    const key = keyOf(c.code_system, c.code_norm)
    const listing = listings.get(key)
    const listedStates = (listing?.states ?? []).map((s) => s.slug).sort()
    const official = cms.get(key)
    // The state's own text: a filtered state's first, then any listing state's, by slug.
    const textState = [...query.states, ...listedStates].find((slug) => listing?.texts.has(slug))
    const textStateRow = allStates.find((s) => s.slug === textState)
    const stateText = textState ? listing?.texts.get(textState) : undefined
    return {
      system: c.code_system,
      codeNorm: c.code_norm,
      code: formatCode(c.code_system, c.code_norm),
      url: codeUrlPath(c.code_system, c.code_norm),
      description: official ?? stateText ?? null,
      descriptionSource: official ? 'cms' : stateText ? 'state' : null,
      descriptionState:
        !official && stateText && textStateRow
          ? { slug: textStateRow.slug, name: textStateRow.name }
          : null,
      listedBy: { count: listedStates.length, states: listedStates },
    }
  })
  return response
}
