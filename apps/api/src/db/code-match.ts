import { type SQL, sql } from 'drizzle-orm'

// The code-matching rules in SQL (docs/data-model.md, "Matching across states"): one builder
// per rule, used by every query that matches codes (drill-down, code pages, state comparison,
// overview, pair similarity, sitemap). They say what `comparePatternKey` (packages/shared/src/
// compare.ts) and `entryCovers` (packages/shared/src/codes.ts) say in TypeScript, and
// src/db/code-match.test.ts checks that they agree on a fixture of every kind of entry.
//
// The builders take column names, not values, and bind no parameters, so a fragment fits in any
// query. Codes are normalized: uppercase letters and digits, no dots.

/** The columns of an entry-shaped row: an `entries` alias, a drill-down row, or a CTE. */
export interface MatchCols {
  system: string
  norm: string
  kind: string
  end: string
  children: string
}

/** The columns of `entries` (or a CTE with the same names) under alias `e`. */
export const entryCols = (e: string): MatchCols => ({
  system: `${e}.code_system`,
  norm: `${e}.code_norm`,
  kind: `${e}.match_kind`,
  end: `${e}.range_end_norm`,
  children: `${e}.includes_children`,
})

/**
 * The columns of a drill-down row (`sys, kind, norm, end_norm, wild`; see `rowColumnsSql`),
 * unqualified or under alias `r`. Its `kind` is already 'exact', 'prefix' or 'range', and `wild`
 * stands in for `includes_children`: the rules read the row as the entry it came from.
 */
export const rowCols = (r?: string): MatchCols => {
  const p = r === undefined ? '' : `${r}.`
  return {
    system: `${p}sys`,
    norm: `${p}norm`,
    kind: `${p}kind`,
    end: `${p}end_norm`,
    children: `${p}wild`,
  }
}

// ---------------------------------------------------------------------------------------------
// Text builders, which the exported SQL builders below wrap and combine.

/** Covers the codes under it (`isWildcard` in compare.ts): a prefix, or a code or range with
 * `includes_children = 1`. */
const isWildcardText = (c: MatchCols) => `(${c.kind} = 'prefix' OR ${c.children} = 1)`

/** The row kind of an entry: a code, a wildcard (prefix or code with children), or a range. */
const kindOfText = (c: MatchCols) => `CASE WHEN ${c.kind} = 'range' THEN 'range'
    WHEN ${isWildcardText(c)} THEN 'prefix' ELSE 'exact' END`

const startsWithText = (prefix: string, code: string) =>
  `substr(${code}, 1, length(${prefix})) = ${prefix}`

const wildRangeText = (c: MatchCols, code: string) =>
  `substr(${code}, 1, length(${c.norm})) >= ${c.norm}
         AND substr(${code}, 1, length(${c.end})) <= ${c.end}`

const sameLengthRangeText = (c: MatchCols, code: string) =>
  `length(${code}) = length(${c.norm}) AND ${code} >= ${c.norm}
         AND ${code} <= ${c.end}`

const rangeCoversText = (c: MatchCols, code: string) => `(CASE WHEN ${c.children} = 1
    THEN ${wildRangeText(c, code)}
    ELSE ${sameLengthRangeText(c, code)} END)`

const coversCodeText = (c: MatchCols, code: string) => `(CASE ${c.kind}
    WHEN 'exact' THEN ${code} = ${c.norm} OR (${c.children} = 1 AND ${startsWithText(c.norm, code)})
    WHEN 'prefix' THEN ${startsWithText(c.norm, code)}
    WHEN 'range' THEN ${rangeCoversText(c, code)}
    ELSE 0 END)`

// ---------------------------------------------------------------------------------------------
// Pattern keys and row kinds

/**
 * A wildcard that is not a range: a prefix or an exact code with children. These cover a code
 * when the code starts with them.
 */
export const coversByPrefixSql = (c: MatchCols): SQL =>
  sql.raw(`(${c.kind} = 'prefix' OR (${c.kind} = 'exact' AND ${c.children} = 1))`)

/**
 * `comparePatternKey`: the same codes however the state wrote them (`F10` with children equals
 * `F10*`). `range_end_norm` is never NULL on a range (a CHECK on `entries`).
 */
export const patternKeySql = (c: MatchCols): SQL =>
  sql.raw(`${c.system} || '|' || CASE
    WHEN ${c.kind} = 'range'
      THEN 'range|' || ${c.norm} || '|' || ${c.end} || '|'
           || CASE WHEN ${c.children} = 1 THEN '*' ELSE '' END
    WHEN ${isWildcardText(c)} THEN 'prefix|' || ${c.norm}
    ELSE 'exact|' || ${c.norm} END`)

/** An entry as a drill-down row: `sys, kind, norm, end_norm, wild` (the columns of `rowCols`). */
export const rowColumnsSql = (c: MatchCols): SQL =>
  sql.raw(`${c.system} AS sys, ${kindOfText(c)} AS kind,
    ${c.norm} AS norm, ${c.end} AS end_norm,
    CASE WHEN ${isWildcardText(c)} THEN 1 ELSE 0 END AS wild`)

// ---------------------------------------------------------------------------------------------
// Coverage

/**
 * `entryCovers(entry, code)`: the entry and the code share a code system, and an exact entry is
 * the code (or its parent, with children), a prefix starts it, a wildcard range has the code's
 * leading characters between its ends, any other range the whole code between its ends with
 * the same length. `includes_children` NULL reads as 0.
 */
export const entryCoversSql = (c: MatchCols, code: { system: string; norm: string }): SQL =>
  sql.raw(`(${c.system} = ${code.system} AND ${coversCodeText(c, code.norm)})`)

/** `entryCovers` for a range entry, the code system already matched. */
export const rangeCoversSql = (c: MatchCols, code: string): SQL => sql.raw(rangeCoversText(c, code))

/**
 * Code `code` lies inside the entry taken as covering its children: the "narrower" test of the
 * M4 table. A single code (exact, no children) has nothing inside it. The code system is the
 * caller's to match.
 */
export const containsSql = (c: MatchCols, code: string): SQL =>
  sql.raw(`(CASE WHEN ${c.kind} = 'exact' AND coalesce(${c.children}, 0) <> 1 THEN 0
    ELSE ${coversCodeText(c, code)} END)`)

// ---------------------------------------------------------------------------------------------
// Coverage as index range scans

/**
 * `code` starts with `prefix`, written as a range of the code column so SQLite searches an index
 * on it ('~' sorts after every letter and digit).
 */
export const prefixBoundsSql = (prefix: string, code: string): SQL =>
  sql.raw(`${code} >= ${prefix} AND ${code} < ${prefix} || '~'`)

/**
 * The codes an entry covers, as a UNION ALL of one branch per way of covering, each a range
 * of the code column so it searches an index (the overview and pair similarity read
 * `unified_universe` and `ref_codes` this way; a CASE over the entry kind would scan instead).
 * `branch(entryFilter, codeMatch)` writes one SELECT: `entryFilter` picks the entries, and
 * `codeMatch` is the condition on `code` for them. Together the branches say `entryCovers`
 * (the code system is the caller's to match), each code once per entry.
 */
export function coverBranchesSql(
  c: MatchCols,
  code: string,
  branch: (entryFilter: SQL, codeMatch: SQL) => SQL,
): SQL {
  const notChildren = `coalesce(${c.children}, 0) <> 1`
  return sql.join(
    [
      // A single code: itself.
      branch(sql.raw(`${c.kind} = 'exact' AND ${notChildren}`), sql.raw(`${code} = ${c.norm}`)),
      // A prefix or a code with children: every code starting with it.
      branch(coversByPrefixSql(c), prefixBoundsSql(c.norm, code)),
      // A wildcard range: the codes whose leading characters fall between its ends.
      branch(
        sql.raw(`${c.kind} = 'range' AND ${c.children} = 1`),
        sql.raw(`${code} >= ${c.norm} AND ${code} < ${c.end} || '~'
      AND ${wildRangeText(c, code)}`),
      ),
      // Any other range: the codes of the same length between its ends.
      branch(
        sql.raw(`${c.kind} = 'range' AND ${notChildren}`),
        sql.raw(`${code} >= ${c.norm} AND ${code} <= ${c.end}
      AND length(${code}) = length(${c.norm})`),
      ),
    ],
    sql.raw('\n  UNION ALL\n'),
  )
}
