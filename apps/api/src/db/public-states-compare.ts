import {
  type CodeSystem,
  codeUrlPath,
  displayEntryCode,
  type DrillCell,
  federalCategories,
  type MatchKind,
  STATES_COMPARE_NONE_LABEL,
  STATES_COMPARE_PAGE_ROWS,
  type StatesCompareGroup,
  type StatesCompareQuery,
  type StatesCompareResponse,
  statesCompareResponseSchema,
  type StatesCompareRow,
  type StatesCompareSimilarity,
  type StatesCompareState,
} from '@mfcd/shared'
import { and, asc, inArray, isNotNull, type SQL, sql } from 'drizzle-orm'

import type { Db } from './client'
import {
  describedSql,
  keyOf,
  kindOf,
  type MatchColumns,
  matchColumns,
  narrowerCount,
  patternOf,
  shared,
  systemRank,
  toCell,
} from './public-drill'
import { states, stateSimilarity } from './schema'

// Compare 2–4 states (roadmap M5 step 7; docs/data-model.md, "Compare states"). Rows are the
// distinct entries of the chosen states' published lists (`comparePatternKey`); each chosen
// state lists a row, covers it or not, by the drill-down's rules and SQL (src/db/public-drill.ts,
// `shared`, with `pub` narrowed to the chosen states). A row is placed in every published
// unified category one of its own entries is placed in (`entry_unified`), or in "Not in a
// unified category". D1 counts, filters and pages; the Worker shapes one page.

const NONE_KEY = 'none'

const federalRank = sql.raw(
  `CASE u.federal_category ${federalCategories.map((f, i) => `WHEN '${f}' THEN ${String(i)}`).join(' ')} END`,
)

/** The chosen states with a list, as `pub`. */
const chosenPub = (ids: readonly string[]) =>
  sql`SELECT id AS state_id, published_version_id AS vid FROM states
      WHERE published_version_id IS NOT NULL
        AND id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`

/** Every distinct entry of the chosen states, as `rows0`. */
const chosenRows = sql`SELECT DISTINCT e.code_system AS sys, ${sql.raw(kindOf('e'))} AS kind,
    e.code_norm AS norm, e.range_end_norm AS end_norm,
    CASE WHEN e.match_kind = 'prefix' OR e.includes_children = 1 THEN 1 ELSE 0 END AS wild
  FROM pub p JOIN entries e ON e.version_id = p.vid`

/**
 * After `shared`:
 * - `rstat`: per row, the chosen states listing or covering it (`n`), the distinct rules of the
 *   entries their cells show (`nq`), and `differs` (`statesCompareDiffers` says the same).
 * - `items`: (group, row) pairs; `gid` is the unified category, 0 for none.
 * - `gorder`: each group's place: the overview's order (federal parent, sort order, label), none last.
 */
const compareCtes = sql`,
  rstat AS MATERIALIZED (
    SELECT r.rk, r.sys, r.kind, r.norm, r.end_norm, r.wild, r.last_norm,
      count(b.state_id) AS n, count(DISTINCT e.qualification) AS nq,
      CASE WHEN count(b.state_id) < (SELECT count(*) FROM pub)
             OR count(DISTINCT e.qualification) > 1 THEN 1 ELSE 0 END AS differs,
      CASE r.kind WHEN 'exact' THEN 0 WHEN 'prefix' THEN 1 ELSE 2 END AS krank
    FROM drows r LEFT JOIN best b ON b.rk = r.rk LEFT JOIN entries e ON e.id = b.entry_id
    GROUP BY r.rk),
  placed AS MATERIALIZED (
    SELECT DISTINCT ${sql.raw(keyOf('e'))} AS rk, eu.unified_id AS gid
    FROM pub p
    JOIN entries e ON e.version_id = p.vid
    JOIN entry_unified eu ON eu.entry_id = e.id
    JOIN unified_categories u ON u.id = eu.unified_id AND u.status = 'published'),
  items AS MATERIALIZED (
    SELECT s.*, coalesce(pl.gid, 0) AS gid FROM rstat s LEFT JOIN placed pl ON pl.rk = s.rk),
  gorder AS MATERIALIZED (
    SELECT g.gid, u.slug, coalesce(u.label, ${STATES_COMPARE_NONE_LABEL}) AS label,
      row_number() OVER (ORDER BY g.gid = 0, ${federalRank}, u.sort_order, u.label, g.gid) AS g_rank
    FROM (SELECT DISTINCT gid FROM items) g LEFT JOIN unified_categories u ON u.id = g.gid)`

/**
 * The filter, then pages: each group's visible rows in code order (`pos`), cut into parts of
 * `pageRows`; a page holds the parts that start within its first `pageRows` rows, so a group is
 * split only when it is longer than a page.
 */
function pagingCtes(diff: boolean, pageRows: number, page: number): SQL {
  const size = sql.raw(String(Math.max(1, Math.trunc(pageRows))))
  return sql`,
  vis AS MATERIALIZED (
    SELECT i.*, row_number() OVER (PARTITION BY i.gid
      ORDER BY ${systemRank}, i.norm, i.krank, coalesce(i.end_norm, '')) - 1 AS pos
    FROM items i WHERE ${diff ? sql`i.differs = 1` : sql`1`}),
  parts AS MATERIALIZED (
    SELECT v.gid, v.pos / ${size} AS part, count(*) AS rows_n, o.g_rank
    FROM vis v JOIN gorder o ON o.gid = v.gid GROUP BY v.gid, v.pos / ${size}),
  ordered AS (
    SELECT gid, part, rows_n, g_rank,
      coalesce(sum(rows_n) OVER (ORDER BY g_rank, part
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before_n
    FROM parts),
  paged AS MATERIALIZED (
    SELECT *, dense_rank() OVER (ORDER BY before_n / ${size}) AS page FROM ordered),
  this_page AS (SELECT min(${page}, coalesce(max(page), 1)) AS page FROM paged)`
}

// ---------------------------------------------------------------------------------------------

interface RowColumns {
  rk: string
  sys: CodeSystem
  kind: MatchKind
  norm: string
  end_norm: string | null
  wild: number
  differs: number
  cms: string | null
  state_desc: string | null
}

const SEPARATOR = '\u001f'

function toRow(r: RowColumns, cells: DrillCell[]): StatesCompareRow {
  const pattern = patternOf(r)
  const [stateId, ...text] = (r.state_desc ?? '').split(SEPARATOR)
  const fromState = r.state_desc !== null && stateId !== undefined
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
    differs: r.differs === 1,
    cells,
  }
}

/** The chosen states in column order; null when one does not exist. */
async function chosenStates(db: Db, ids: readonly string[]): Promise<StatesCompareState[] | null> {
  const rows = await db
    .select({
      id: states.id,
      slug: states.slug,
      name: states.name,
      vid: states.publishedVersionId,
    })
    .from(states)
    .where(inArray(states.id, [...ids]))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const found = ids.flatMap((id) => {
    const s = byId.get(id)
    return s ? [{ id: s.id, slug: s.slug, name: s.name, hasList: s.vid !== null }] : []
  })
  return found.length === ids.length ? found : null
}

/** Every state with a list, by name: the pickers. */
function choices(db: Db) {
  return db
    .select({ id: states.id, slug: states.slug, name: states.name })
    .from(states)
    .where(isNotNull(states.publishedVersionId))
    .orderBy(asc(states.name))
}

/** The stored pair similarity, in column order; null when not computed. */
async function pairSimilarity(
  db: Db,
  first: string,
  second: string,
): Promise<StatesCompareSimilarity | null> {
  const [a, b] = first < second ? [first, second] : [second, first]
  const [row] = await db
    .select()
    .from(stateSimilarity)
    .where(and(sql`${stateSimilarity.stateA} = ${a}`, sql`${stateSimilarity.stateB} = ${b}`))
  if (!row) return null
  return {
    jaccard: row.jaccard,
    shared: row.shared,
    onlyFirst: first === a ? row.onlyA : row.onlyB,
    onlySecond: first === a ? row.onlyB : row.onlyA,
  }
}

export interface StatesCompareOptions {
  dataVersion: number
  /** Rows a page starts its groups within (tests use a small one). */
  pageRows?: number
}

/** One page of the comparison; null when a chosen state does not exist. */
export async function publicStatesCompare(
  db: Db,
  ids: readonly string[],
  query: StatesCompareQuery,
  { dataVersion, pageRows = STATES_COMPARE_PAGE_ROWS }: StatesCompareOptions,
): Promise<StatesCompareResponse | null> {
  const [chosen, picks] = await Promise.all([chosenStates(db, ids), choices(db)])
  if (!chosen) return null
  const base = {
    dataVersion,
    states: chosen,
    choices: picks,
    query: { diff: query.diff },
  }
  if (chosen.some((s) => !s.hasList)) {
    return statesCompareResponseSchema.parse({
      ...base,
      summary: null,
      totalRows: 0,
      totalGroups: 0,
      page: 1,
      pageCount: 1,
      groups: [],
    })
  }

  const size = Math.max(1, Math.trunc(pageRows))
  const ctes = sql`${shared(chosenRows, chosenPub(ids))}${compareCtes}${pagingCtes(query.diff, size, query.page)}`

  interface PageRow extends RowColumns, MatchColumns {
    state_id: string
    gid: number
    pos: number
  }
  interface StatRow {
    kind: 'group' | 'gstate' | 'state' | 'total' | 'paging'
    gid: number | null
    state_id: string | null
    slug: string | null
    label: string | null
    g_rank: number | null
    a: number
    b: number
    c: number
  }

  const [rows, stats, similarity] = await Promise.all([
    db.all<PageRow>(sql`${ctes}
      SELECT v.rk, v.sys, v.kind, v.norm, v.end_norm, v.wild, v.differs, v.gid, v.pos,
        ${describedSql},
        p.state_id, b.score AS m_score, ${matchColumns('e', 'm')},
        CASE WHEN b.rk IS NULL AND v.kind <> 'exact'
          THEN ${narrowerCount('v', 'p.vid')} END AS m_narrower
      FROM vis v
      JOIN paged g ON g.gid = v.gid AND g.part = v.pos / ${sql.raw(String(size))}
      CROSS JOIN pub p
      LEFT JOIN best b ON b.rk = v.rk AND b.state_id = p.state_id
      LEFT JOIN entries e ON e.id = b.entry_id
      WHERE g.page = (SELECT page FROM this_page)
      ORDER BY g.g_rank, v.pos`),
    // The counts, in one statement so the shared CTEs run once: per group (its rows, how many
    // differ, how many the filter keeps), per group and state, per state (codes only it lists),
    // the totals, and the paging.
    db.all<StatRow>(sql`${ctes}
      SELECT 'group' AS kind, i.gid, NULL AS state_id, o.slug, o.label, o.g_rank,
        count(*) AS a, sum(i.differs) AS b,
        (SELECT count(*) FROM vis v WHERE v.gid = i.gid) AS c
      FROM items i JOIN gorder o ON o.gid = i.gid GROUP BY i.gid
      UNION ALL
      SELECT 'gstate', i.gid, b.state_id, NULL, NULL, NULL, count(*), 0, 0
      FROM items i JOIN best b ON b.rk = i.rk GROUP BY i.gid, b.state_id
      UNION ALL
      SELECT 'state', NULL, b.state_id, NULL, NULL, NULL, count(*), 0, 0
      FROM rstat s JOIN best b ON b.rk = s.rk WHERE s.n = 1 GROUP BY b.state_id
      UNION ALL
      SELECT 'total', NULL, NULL, NULL, NULL, NULL,
        (SELECT count(*) FROM rstat), (SELECT count(*) FROM rstat WHERE differs = 1),
        (SELECT count(*) FROM rstat WHERE n = (SELECT count(*) FROM pub))
      UNION ALL
      SELECT 'paging', NULL, NULL, NULL, NULL, (SELECT page FROM this_page),
        (SELECT count(DISTINCT rk) FROM vis), (SELECT count(DISTINCT gid) FROM vis),
        (SELECT coalesce(max(page), 1) FROM paged)`),
    ids.length === 2 && ids[0] !== undefined && ids[1] !== undefined
      ? pairSimilarity(db, ids[0], ids[1])
      : Promise.resolve(null),
  ])

  const column = new Map(ids.map((id, i) => [id, i]))
  const total = stats.find((r) => r.kind === 'total')
  const paging = stats.find((r) => r.kind === 'paging')
  const only = ids.map(() => 0)
  for (const r of stats) {
    const i = r.state_id === null ? undefined : column.get(r.state_id)
    if (r.kind === 'state' && i !== undefined) only[i] = r.a
  }
  const groupStats = new Map(
    stats
      .filter((r) => r.kind === 'group')
      .map((r) => [r.gid ?? 0, { ...r, counts: ids.map(() => 0) }]),
  )
  for (const r of stats) {
    const i = r.state_id === null ? undefined : column.get(r.state_id)
    const g = groupStats.get(r.gid ?? 0)
    if (r.kind === 'gstate' && g && i !== undefined) g.counts[i] = r.a
  }

  // One SQL row per (group, row, state), in group and code order.
  const groups = new Map<number, StatesCompareGroup>()
  const rowsBy = new Map<string, { row: RowColumns; cells: DrillCell[] }>()
  for (const r of rows) {
    const g = groupStats.get(r.gid)
    if (!g) continue
    let group = groups.get(r.gid)
    if (!group) {
      group = {
        key: r.gid === 0 ? NONE_KEY : (g.slug ?? String(r.gid)),
        slug: r.gid === 0 ? null : g.slug,
        label: g.label ?? STATES_COMPARE_NONE_LABEL,
        counts: g.counts,
        allRows: g.a,
        differing: g.b,
        rowCount: g.c,
        continued: r.pos >= size,
        rows: [],
      }
      groups.set(r.gid, group)
    }
    const key = `${String(r.gid)}|${r.rk}`
    let item = rowsBy.get(key)
    if (!item) {
      item = {
        row: r,
        cells: ids.map(() => ({ status: 'not_listed', match: null, narrowerCount: 0 })),
      }
      rowsBy.set(key, item)
      group.rows.push(toRow(r, item.cells))
    }
    const i = column.get(r.state_id)
    if (i !== undefined) item.cells[i] = toCell(r)
  }

  return statesCompareResponseSchema.parse({
    ...base,
    summary: {
      only,
      all: total?.c ?? 0,
      rows: total?.a ?? 0,
      differing: total?.b ?? 0,
      similarity,
    },
    totalRows: paging?.a ?? 0,
    totalGroups: paging?.b ?? 0,
    page: paging?.g_rank ?? 1,
    pageCount: paging?.c ?? 1,
    groups: [...groups.values()],
  })
}

/** Every code of the comparison (no filter, no paging) with every chosen state's cell: the CSV. */
export async function publicStatesCompareCsv(
  db: Db,
  ids: readonly string[],
): Promise<{
  states: StatesCompareState[]
  rows: (StatesCompareRow & { groups: string })[]
} | null> {
  const chosen = await chosenStates(db, ids)
  if (!chosen || chosen.some((s) => !s.hasList)) return null
  const ctes = sql`${shared(chosenRows, chosenPub(ids))}${compareCtes}`

  type Cell = MatchColumns & { rk: string; state_id: string }
  const [rows, matches, narrower] = await Promise.all([
    db.all<RowColumns & { groups: string }>(sql`${ctes}
      SELECT v.rk, v.sys, v.kind, v.norm, v.end_norm, v.wild, v.differs, ${describedSql},
        (SELECT group_concat(label, '; ') FROM (
          SELECT o.label FROM items i JOIN gorder o ON o.gid = i.gid
          WHERE i.rk = v.rk ORDER BY o.g_rank)) AS groups
      FROM rstat v
      ORDER BY ${systemRank}, v.norm, v.krank, coalesce(v.end_norm, '')`),
    db.all<Cell>(sql`${ctes}
      SELECT v.rk, b.state_id, b.score AS m_score, ${matchColumns('e', 'm')}
      FROM rstat v JOIN best b ON b.rk = v.rk JOIN entries e ON e.id = b.entry_id`),
    db.all<{ rk: string; state_id: string; n: number }>(sql`${ctes}
      SELECT v.rk, p.state_id, ${narrowerCount('v', 'p.vid')} AS n
      FROM rstat v CROSS JOIN pub p
      WHERE v.kind <> 'exact'
        AND NOT EXISTS (SELECT 1 FROM best b WHERE b.rk = v.rk AND b.state_id = p.state_id)`),
  ])
  const matchBy = new Map(matches.map((m) => [`${m.rk}|${m.state_id}`, m]))
  const narrowerBy = new Map(narrower.map((m) => [`${m.rk}|${m.state_id}`, m.n]))
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
    states: chosen,
    rows: rows.map((r) => ({
      ...toRow(
        r,
        ids.map((id) => {
          const key = `${r.rk}|${id}`
          return toCell(matchBy.get(key) ?? { ...none, m_narrower: narrowerBy.get(key) ?? 0 })
        }),
      ),
      groups: r.groups,
    })),
  }
}
