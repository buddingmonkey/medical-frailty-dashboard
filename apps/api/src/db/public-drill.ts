import {
  codeSystemLabels,
  type CodeSystem,
  codeSystems,
  codeUrlPath,
  compareDrillGroups,
  compareDrillRows,
  type DrillCell,
  type DrillDetailResponse,
  drillDetailResponseSchema,
  type DrillGroup,
  DRILL_PAGE_ROWS,
  type DrillPattern,
  type DrillQuery,
  type DrillResponse,
  drillResponseSchema,
  type DrillRow,
  drillRules,
  type DrillState,
  displayEntryCode,
  type MatchKind,
  parsePatternKey,
  type Qualification,
  type QualificationBasis,
} from '@mfcd/shared'
import { asc, eq, type SQL, sql } from 'drizzle-orm'

import type { Db } from './client'
import {
  containsSql,
  coversByPrefixSql,
  entryCols,
  patternKeySql,
  rangeCoversSql,
  rowColumnsSql,
  rowCols,
} from './code-match'
import { refCcsrCategories, states, unifiedCategories, unifiedCcsr } from './schema'

// The category drill-down (roadmap M5 step 6; docs/data-model.md, "Drill-down"). D1 does the
// counting: for each row (a code, wildcard or range placed in the category, plus the
// category's universe codes with `all=1`) the states with a list that list it exactly or cover
// it, by the rules of "Matching across states" (`entryCovers`, `comparePatternKey`). The
// Worker only shapes one page of rows, so a request stays well inside the Free plan's 10 ms
// of CPU however many entries the states have.

// ---------------------------------------------------------------------------------------------
// SQL pieces. The matching rules are src/db/code-match.ts; `e` stands for any alias of `entries`.

/** `comparePatternKey` of an entry: F10 with children = F10*. */
export const keyOf = (e: string) => patternKeySql(entryCols(e))

/**
 * Entries of version `vid` inside row `r` (`containsSql`), other than the row itself: a range
 * scan of `entries_version_code_idx`.
 */
export const narrowerCount = (r: string, vid: string) =>
  sql`(SELECT count(*) FROM entries n
    WHERE n.version_id = ${sql.raw(vid)} AND n.code_system = ${sql.raw(r)}.sys
      AND n.code_norm >= ${sql.raw(r)}.norm AND n.code_norm < ${sql.raw(r)}.last_norm || '~'
      AND ${containsSql(rowCols(r), 'n.code_norm')}
      AND (n.range_end_norm IS NULL OR ${containsSql(rowCols(r), 'n.range_end_norm')})
      AND ${keyOf('n')} <> ${sql.raw(r)}.rk)`

const qualificationRank = sql.raw(`CASE e.qualification WHEN 'standalone' THEN 0
  WHEN 'needs_support' THEN 1 WHEN 'supporting_only' THEN 2 ELSE 3 END`)

export const systemRank = sql.raw(
  `CASE sys ${codeSystems.map((s, i) => `WHEN '${s}' THEN ${String(i)}`).join(' ')} END`,
)

/**
 * The CTEs every drill-down query shares, over the rows `rows0` gives (columns sys, kind, norm,
 * end_norm, wild):
 * - `pub`: the states with a list and their published version (or only some of them: `pub0`).
 * - `drows`: each row with `last_norm` (its last code), `rk` (its key) and `gk` (its group).
 * - `wilds`, `ranges`: the published wildcards and ranges, read once.
 * - `cand`: (row, state) pairs where one of the state's entries lists the row (`how` 0) or
 *   covers it (`how` 1): a wildcard is found by looking up each prefix of the code in `wilds`
 *   (CROSS JOIN fixes that order; left to itself SQLite scanned every published entry for each
 *   prefix length), a range by checking the few ranges there are.
 * - `best`: per row and state, the entry M4 would show: listed before covered, then the rule
 *   that qualifies most on its own (SQLite takes `entry_id` from the row with the minimum).
 */
export function shared(rows0: SQL, pub0?: SQL): SQL {
  const pub =
    pub0 ??
    sql`SELECT id AS state_id, published_version_id AS vid FROM states
          WHERE published_version_id IS NOT NULL`
  return sql`WITH RECURSIVE
  pub AS (${pub}),
  lens(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM lens WHERE k < 40),
  rows0 AS (${rows0}),
  drows AS MATERIALIZED (
    SELECT sys, kind, norm, end_norm, wild, coalesce(end_norm, norm) AS last_norm,
      ${patternKeySql(rowCols())} AS rk,
      CASE WHEN sys = 'icd10cm' THEN 'icd10cm|' || substr(norm, 1, 3) ELSE sys END AS gk
    FROM rows0),
  ranges AS MATERIALIZED (
    SELECT p.state_id, e.id, e.code_system, e.code_norm, e.range_end_norm, e.match_kind,
      e.includes_children, ${qualificationRank} AS qrank
    FROM pub p JOIN entries e ON e.version_id = p.vid WHERE e.match_kind = 'range'),
  wilds AS MATERIALIZED (
    SELECT p.state_id, e.id, e.code_system, e.code_norm, ${keyOf('e')} AS rk,
      ${qualificationRank} AS qrank
    FROM pub p JOIN entries e ON e.version_id = p.vid
    WHERE ${coversByPrefixSql(entryCols('e'))}),
  cand AS (
    SELECT r.rk, p.state_id, 0 AS how, e.id AS entry_id, ${qualificationRank} AS qrank
    FROM drows r
    JOIN entries e ON e.code_norm = r.norm AND e.code_system = r.sys
    JOIN pub p ON p.vid = e.version_id
    WHERE ${keyOf('e')} = r.rk
    UNION ALL
    SELECT r.rk, w.state_id, 1, w.id, w.qrank
    FROM drows r
    CROSS JOIN lens n
    CROSS JOIN wilds w
    WHERE n.k <= length(r.norm) AND w.code_norm = substr(r.norm, 1, n.k)
      AND w.code_system = r.sys AND substr(r.last_norm, 1, n.k) = w.code_norm
      AND w.rk <> r.rk
    UNION ALL
    SELECT r.rk, g.state_id, 1, g.id, g.qrank
    FROM drows r JOIN ranges g ON g.code_system = r.sys
    WHERE ${rangeCoversSql(entryCols('g'), 'r.norm')}
      AND ${rangeCoversSql(entryCols('g'), 'r.last_norm')}
      AND ${keyOf('g')} <> r.rk),
  best AS MATERIALIZED (
    SELECT rk, state_id, min(how * 10 + qrank) AS score, entry_id
    FROM cand GROUP BY rk, state_id)`
}

/** The rows placed in a category, plus its universe codes when asked. */
function placedRows(unifiedId: number, withUniverse: boolean): SQL {
  const placed = sql`SELECT DISTINCT ${rowColumnsSql(entryCols('e'))}
    FROM states s
    JOIN entries e ON e.version_id = s.published_version_id
    JOIN entry_unified eu ON eu.entry_id = e.id AND eu.unified_id = ${unifiedId}`
  if (!withUniverse) return placed
  return sql`${placed}
    UNION
    SELECT 'icd10cm', 'exact', code_norm, NULL, 0 FROM unified_universe WHERE unified_id = ${unifiedId}`
}

/** Per row: the count of states and of each rule (with how many of them are inferred). */
const countedCte = sql`counted AS MATERIALIZED (
    SELECT r.rk, r.sys, r.kind, r.norm, r.end_norm, r.wild, r.last_norm, r.gk,
      count(b.state_id) AS n,
      coalesce(sum(e.qualification = 'standalone'), 0) AS q_standalone,
      coalesce(sum(e.qualification = 'standalone' AND e.qualification_basis = 'inferred'), 0) AS i_standalone,
      coalesce(sum(e.qualification = 'needs_support'), 0) AS q_needs_support,
      coalesce(sum(e.qualification = 'needs_support' AND e.qualification_basis = 'inferred'), 0) AS i_needs_support,
      coalesce(sum(e.qualification = 'supporting_only'), 0) AS q_supporting_only,
      coalesce(sum(e.qualification = 'supporting_only' AND e.qualification_basis = 'inferred'), 0) AS i_supporting_only,
      coalesce(sum(e.qualification = 'unknown'), 0) AS q_unknown,
      coalesce(sum(e.qualification = 'unknown' AND e.qualification_basis = 'inferred'), 0) AS i_unknown
    FROM drows r LEFT JOIN best b ON b.rk = r.rk LEFT JOIN entries e ON e.id = b.entry_id
    GROUP BY r.rk)`

/** The filter, in SQL (`drillKeeps` in packages/shared says the same). */
function showSql(show: DrillQuery['show']): SQL {
  const m = sql`(SELECT count(*) FROM pub)`
  switch (show) {
    case 'all':
      return sql`1`
    case 'everyone':
      return sql`n = ${m} AND ${m} > 0`
    case 'gaps':
      return sql`n * 2 < ${m}`
    case 'one':
      return sql`n = 1`
  }
}

/** `counted` → `visible` (filters) → `vgroups` → `paged` (page numbers by group). */
function pagingCtes(query: DrillQuery, system: CodeSystem | null, pageRows: number): SQL {
  return sql`${countedCte},
  grp_any AS MATERIALIZED (
    SELECT r.gk, count(DISTINCT b.state_id) AS any_n
    FROM drows r LEFT JOIN best b ON b.rk = r.rk GROUP BY r.gk),
  visible AS MATERIALIZED (
    SELECT * FROM counted
    WHERE ${system === null ? sql`1` : sql`sys = ${system}`} AND ${showSql(query.show)}),
  vgroups AS MATERIALIZED (
    SELECT v.gk, min(v.sys) AS sys, count(*) AS rows_n, a.any_n
    FROM visible v JOIN grp_any a ON a.gk = v.gk GROUP BY v.gk),
  ordered AS (
    SELECT gk, sys, rows_n, any_n,
      row_number() OVER w AS g_rank,
      coalesce(sum(rows_n) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before_n
    FROM vgroups
    WINDOW w AS (ORDER BY any_n DESC, ${systemRank}, gk)),
  paged AS MATERIALIZED (
    SELECT *, dense_rank() OVER (ORDER BY before_n / ${sql.raw(String(Math.max(1, Math.trunc(pageRows))))}) AS page FROM ordered)`
}

// ---------------------------------------------------------------------------------------------
// Shaping rows

export interface CountedRow {
  rk: string
  sys: CodeSystem
  kind: MatchKind
  norm: string
  end_norm: string | null
  wild: number
  gk: string
  n: number
  q_standalone: number
  i_standalone: number
  q_needs_support: number
  i_needs_support: number
  q_supporting_only: number
  i_supporting_only: number
  q_unknown: number
  i_unknown: number
}

export interface DescribedRow extends CountedRow {
  cms: string | null
  state_desc: string | null
}

/** The row as a pattern, as `displayEntryCode` and `comparePatternKey` take it. */
export const patternOf = (
  r: Pick<CountedRow, 'sys' | 'kind' | 'norm' | 'end_norm' | 'wild'>,
): DrillPattern => ({
  codeSystem: r.sys,
  codeNorm: r.norm,
  matchKind: r.kind,
  rangeEndNorm: r.kind === 'range' ? r.end_norm : null,
  includesChildren: r.wild === 1 ? 1 : 0,
})

const SEPARATOR = '\u001f'

/** The row's description: CMS text, else the first state's own published text, named. */
export const describedSql = sql`
  CASE WHEN v.kind <> 'range' THEN (SELECT rc.description FROM ref_codes rc
    WHERE rc.code_system = v.sys AND rc.code_norm = v.norm ORDER BY rc.valid_from DESC LIMIT 1)
  END AS cms,
  (SELECT p.state_id || char(31) || e.description_published
    FROM pub p JOIN entries e ON e.version_id = p.vid AND e.code_norm = v.norm
    WHERE e.code_system = v.sys AND ${keyOf('e')} = v.rk
      AND trim(coalesce(e.description_published, '')) <> ''
    ORDER BY p.state_id LIMIT 1) AS state_desc`

export function toRow(r: DescribedRow): Omit<DrillRow, 'focus'> {
  const pattern = patternOf(r)
  const [stateId, ...text] = (r.state_desc ?? '').split(SEPARATOR)
  const fromState = r.state_desc !== null && stateId !== undefined
  const counts = (q: Qualification) => ({
    count: r[`q_${q}`],
    inferred: r[`i_${q}`],
  })
  return {
    key: r.rk,
    codeSystem: r.sys,
    codeNorm: r.norm,
    matchKind: r.kind,
    rangeEndNorm: pattern.rangeEndNorm,
    wildcard: r.wild === 1,
    display: displayEntryCode(pattern),
    codePath: r.kind === 'exact' ? codeUrlPath(r.sys, r.norm) : null,
    description: r.cms ?? (fromState ? text.join(SEPARATOR) : null),
    descriptionSource: r.cms !== null ? 'cms' : fromState ? stateId : null,
    count: r.n,
    rules: drillRules({
      standalone: counts('standalone'),
      needs_support: counts('needs_support'),
      supporting_only: counts('supporting_only'),
      unknown: counts('unknown'),
    }),
  }
}

/** Columns of a matched entry `m`, prefixed, for `toCell`. */
export const matchColumns = (m: string, prefix: string) =>
  sql.raw(`${m}.code_system AS ${prefix}_sys, ${m}.code_norm AS ${prefix}_norm,
    ${m}.match_kind AS ${prefix}_kind, ${m}.range_end_norm AS ${prefix}_end,
    ${m}.includes_children AS ${prefix}_children, ${m}.tier AS ${prefix}_tier,
    ${m}.qualification AS ${prefix}_q, ${m}.qualification_basis AS ${prefix}_basis,
    ${m}.state_category AS ${prefix}_cat, ${m}.state_subcategory AS ${prefix}_sub`)

export interface MatchColumns {
  m_score: number | null
  m_sys: CodeSystem | null
  m_norm: string | null
  m_kind: MatchKind | null
  m_end: string | null
  m_children: number | null
  m_tier: string | null
  m_q: Qualification | null
  m_basis: QualificationBasis | null
  m_cat: string | null
  m_sub: string | null
  m_narrower: number | null
}

export function toCell(m: MatchColumns): DrillCell {
  if (m.m_score !== null && m.m_sys !== null && m.m_norm !== null && m.m_kind !== null) {
    return {
      status: m.m_score >= 10 ? 'covered' : 'exact',
      narrowerCount: 0,
      match: {
        display: displayEntryCode({
          codeSystem: m.m_sys,
          codeNorm: m.m_norm,
          matchKind: m.m_kind,
          rangeEndNorm: m.m_end,
          includesChildren: m.m_children === 1 ? 1 : m.m_children === 0 ? 0 : null,
        }),
        tier: m.m_tier,
        qualification: m.m_q ?? 'unknown',
        qualificationBasis: m.m_basis ?? 'published',
        stateCategory: m.m_cat ?? '',
        stateSubcategory: m.m_sub ?? '',
      },
    }
  }
  const narrower = m.m_narrower ?? 0
  return narrower > 0
    ? { status: 'narrower', match: null, narrowerCount: narrower }
    : { status: 'not_listed', match: null, narrowerCount: 0 }
}

// ---------------------------------------------------------------------------------------------
// Loaders

interface CategoryContext {
  category: DrillResponse['category']
  states: (DrillState & { vid: number | null })[]
  systems: CodeSystem[]
}

/** The published category by slug, with every state and the systems among its rows; null: none. */
async function categoryContext(db: Db, slug: string): Promise<CategoryContext | null> {
  const [found] = await db
    .select()
    .from(unifiedCategories)
    .where(eq(unifiedCategories.slug, slug))
    .limit(1)
  if (found?.status !== 'published' || found.federalCategory === 'unmapped') return null
  const [stateRows, ccsr, universe, systems] = await Promise.all([
    db
      .select({
        id: states.id,
        slug: states.slug,
        name: states.name,
        vid: states.publishedVersionId,
      })
      .from(states)
      .orderBy(asc(states.name)),
    db
      .select({ id: unifiedCcsr.ccsrCategory, description: refCcsrCategories.description })
      .from(unifiedCcsr)
      .leftJoin(refCcsrCategories, eq(refCcsrCategories.ccsrCategory, unifiedCcsr.ccsrCategory))
      .where(eq(unifiedCcsr.unifiedId, found.id))
      .orderBy(asc(unifiedCcsr.ccsrCategory)),
    db.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM unified_universe WHERE unified_id = ${found.id}`,
    ),
    db.all<{ sys: CodeSystem }>(sql`SELECT DISTINCT e.code_system AS sys
      FROM states s
      JOIN entries e ON e.version_id = s.published_version_id
      JOIN entry_unified eu ON eu.entry_id = e.id AND eu.unified_id = ${found.id}`),
  ])
  const universeSize = universe[0]?.n ?? 0
  const present = new Set(systems.map((s) => s.sys))
  if (universeSize > 0) present.add('icd10cm')
  return {
    category: {
      id: found.id,
      slug: found.slug,
      label: found.label,
      definition: found.definition,
      includes: found.includes,
      excludes: found.excludes,
      federalCategory: found.federalCategory,
      version: found.version,
      universeSize,
      ccsr: ccsr.map((c) => ({ id: c.id, description: c.description ?? c.id })),
    },
    states: stateRows,
    systems: codeSystems.filter((s) => present.has(s)),
  }
}

export interface DrillOptions {
  dataVersion: number
  /** Rows a page starts its groups within (tests use a small one). */
  pageRows?: number
}

/** One page of the drill-down; null when the slug is not a published unified category. */
export async function publicDrill(
  db: Db,
  slug: string,
  query: DrillQuery,
  { dataVersion, pageRows = DRILL_PAGE_ROWS }: DrillOptions,
): Promise<DrillResponse | null> {
  const context = await categoryContext(db, slug)
  if (!context) return null
  const { category } = context
  const withList = context.states.filter((s) => s.vid !== null)
  const focus = withList.find((s) => s.id === query.focus) ?? null
  const all = query.all && category.universeSize > 0
  const system =
    query.system !== null && context.systems.includes(query.system) ? query.system : null

  interface PageRow extends DescribedRow, MatchColumns {
    any_n: number
    rows_n: number
    page: number
    page_count: number
    total_rows: number
    total_groups: number
    group_desc: string | null
  }

  const focusColumns = focus
    ? sql`fb.score AS m_score, ${matchColumns('fe', 'm')},
        CASE WHEN fb.rk IS NULL AND v.kind <> 'exact'
          THEN ${narrowerCount('v', String(focus.vid))} END AS m_narrower`
    : sql`NULL AS m_score`
  const focusJoin = focus
    ? sql`LEFT JOIN best fb ON fb.rk = v.rk AND fb.state_id = ${focus.id}
          LEFT JOIN entries fe ON fe.id = fb.entry_id`
    : sql``

  const pageQuery = sql`${shared(placedRows(category.id, all))},
    ${pagingCtes(query, system, pageRows)},
    this_page AS (SELECT min(${query.page}, coalesce(max(page), 1)) AS page FROM paged)
    SELECT v.*, g.any_n, g.rows_n, g.page,
      (SELECT max(page) FROM paged) AS page_count,
      (SELECT count(*) FROM visible) AS total_rows,
      (SELECT count(*) FROM vgroups) AS total_groups,
      CASE WHEN v.sys = 'icd10cm' THEN (SELECT rc.description FROM ref_codes rc
        WHERE rc.code_system = 'icd10cm' AND rc.code_norm = substr(v.norm, 1, 3)
        ORDER BY rc.valid_from DESC LIMIT 1) END AS group_desc,
      ${describedSql},
      ${focusColumns}
    FROM visible v
    JOIN paged g ON g.gk = v.gk
    ${focusJoin}
    WHERE g.page = (SELECT page FROM this_page)`
  const rows = await db.all<PageRow>(pageQuery)

  const groups = new Map<string, DrillGroup>()
  for (const r of rows) {
    let group = groups.get(r.gk)
    if (!group) {
      group = {
        key: r.gk,
        codeSystem: r.sys,
        label: r.sys === 'icd10cm' ? r.gk.slice('icd10cm|'.length) : codeSystemLabels[r.sys],
        description: r.group_desc,
        anyCount: r.any_n,
        rowCount: r.rows_n,
        rows: [],
      }
      groups.set(r.gk, group)
    }
    group.rows.push({ ...toRow(r), focus: focus ? toCell(r) : null })
  }
  // The same order as the SQL's `g_rank`, which chose the page.
  const ordered = [...groups.values()].sort(compareDrillGroups)
  const head = rows[0]

  return drillResponseSchema.parse({
    dataVersion,
    category,
    states: withList.map(({ id, slug: s, name }) => ({ id, slug: s, name })),
    systems: context.systems,
    query: { show: query.show, system, all, focus: focus?.id ?? null },
    totalRows: head?.total_rows ?? 0,
    totalGroups: head?.total_groups ?? 0,
    page: head?.page ?? 1,
    pageCount: head?.page_count ?? 1,
    groups: ordered.map((g) => ({
      ...g,
      rows: [...g.rows].sort(compareDrillRows),
    })),
  })
}

/** Every state's cell for one row; null when the category is not published. */
export async function publicDrillDetail(
  db: Db,
  slug: string,
  key: string,
  dataVersion: number,
): Promise<DrillDetailResponse | null> {
  const pattern = parsePatternKey(key)
  const context = pattern ? await categoryContext(db, slug) : null
  if (!pattern || !context) return null
  const one = sql`SELECT ${pattern.codeSystem} AS sys,
    ${pattern.matchKind === 'range' ? 'range' : pattern.includesChildren === 1 ? 'prefix' : 'exact'} AS kind,
    ${pattern.codeNorm} AS norm, ${pattern.rangeEndNorm} AS end_norm,
    ${pattern.includesChildren} AS wild`

  type Cell = MatchColumns & { state_id: string }
  const [counted, cells] = await Promise.all([
    db.all<DescribedRow>(sql`${shared(one)}, ${countedCte}
      SELECT v.*, ${describedSql} FROM counted v`),
    db.all<Cell>(sql`${shared(one)}
      SELECT p.state_id, b.score AS m_score, ${matchColumns('e', 'm')},
        CASE WHEN b.rk IS NULL AND v.kind <> 'exact'
          THEN ${narrowerCount('v', 'p.vid')} END AS m_narrower
      FROM pub p CROSS JOIN drows v
      LEFT JOIN best b ON b.rk = v.rk AND b.state_id = p.state_id
      LEFT JOIN entries e ON e.id = b.entry_id`),
  ])
  const row = counted[0]
  if (!row) return null
  const byState = new Map(cells.map((c) => [c.state_id, c]))
  const withList = context.states.filter((s) => s.vid !== null)
  return drillDetailResponseSchema.parse({
    dataVersion,
    row: toRow(row),
    statesWithList: withList.length,
    states: context.states.map(({ id, slug: s, name, vid }) => {
      const cell = byState.get(id)
      return {
        id,
        slug: s,
        name,
        hasList: vid !== null,
        cell:
          vid === null || !cell
            ? { status: 'no_list', match: null, narrowerCount: 0 }
            : toCell(cell),
      }
    }),
  })
}

/** Every row of the view (no paging) with every state's cell: the CSV download. */
export async function publicDrillCsv(
  db: Db,
  slug: string,
  query: DrillQuery,
): Promise<{
  category: DrillResponse['category']
  states: DrillState[]
  rows: (Omit<DrillRow, 'focus'> & { cells: DrillCell[] })[]
} | null> {
  const context = await categoryContext(db, slug)
  if (!context) return null
  const { category } = context
  const all = query.all && category.universeSize > 0
  const system =
    query.system !== null && context.systems.includes(query.system) ? query.system : null
  const ctes = sql`${shared(placedRows(category.id, all))}, ${pagingCtes(query, system, DRILL_PAGE_ROWS)}`

  type Cell = MatchColumns & { rk: string; state_id: string }
  const [rows, matches, narrower] = await Promise.all([
    db.all<DescribedRow & { g_rank: number }>(sql`${ctes}
      SELECT v.*, g.g_rank, ${describedSql} FROM visible v JOIN paged g ON g.gk = v.gk`),
    db.all<Cell>(sql`${ctes}
      SELECT v.rk, b.state_id, b.score AS m_score, ${matchColumns('e', 'm')}
      FROM visible v JOIN best b ON b.rk = v.rk JOIN entries e ON e.id = b.entry_id`),
    db.all<{ rk: string; state_id: string; n: number }>(sql`${ctes}
      SELECT v.rk, p.state_id, ${narrowerCount('v', 'p.vid')} AS n
      FROM visible v CROSS JOIN pub p
      WHERE v.kind <> 'exact'
        AND NOT EXISTS (SELECT 1 FROM best b WHERE b.rk = v.rk AND b.state_id = p.state_id)`),
  ])
  const withList = context.states.filter((s) => s.vid !== null)
  const matchBy = new Map(matches.map((m) => [`${m.rk}|${m.state_id}`, m]))
  const narrowerBy = new Map(narrower.map((m) => [`${m.rk}|${m.state_id}`, m.n]))
  const ordered = [...rows].sort(
    (a, b) =>
      a.g_rank - b.g_rank ||
      compareDrillRows(
        {
          codeSystem: a.sys,
          codeNorm: a.norm,
          matchKind: a.kind,
          rangeEndNorm: a.end_norm,
          count: a.n,
        },
        {
          codeSystem: b.sys,
          codeNorm: b.norm,
          matchKind: b.kind,
          rangeEndNorm: b.end_norm,
          count: b.n,
        },
      ),
  )
  const none: MatchColumns = {
    m_score: null,
    m_sys: null,
    m_norm: null,
    m_kind: null,
    m_end: null,
    m_children: null,
    m_tier: null,
    m_q: null,
    m_basis: null,
    m_cat: null,
    m_sub: null,
    m_narrower: null,
  }
  return {
    category,
    states: withList.map(({ id, slug: s, name }) => ({ id, slug: s, name })),
    rows: ordered.map((r) => ({
      ...toRow(r),
      cells: withList.map((s) => {
        const key = `${r.rk}|${s.id}`
        return toCell(matchBy.get(key) ?? { ...none, m_narrower: narrowerBy.get(key) ?? 0 })
      }),
    })),
  }
}
