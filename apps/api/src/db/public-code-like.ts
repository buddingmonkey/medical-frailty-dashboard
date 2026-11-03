import {
  CODE_SPAN_END,
  type CodeSystem,
  displayEntryCode,
  LIKE_CODES_PER_GROUP,
  type LikeCodeMatch,
  type MatchKind,
} from '@mfcd/shared'
import { sql } from 'drizzle-orm'

import type { Db } from './client'

// Like codes for the code detail page (roadmap M6 step 4; docs/data-model.md, "Like codes").
// Two queries: the published condition groups the code is in (a lookup on
// condition_members_code_idx), then, only when there are some and a state does not list or
// cover the code, those states' entries in another code system that share a code with one of
// the groups' members. The span rules are `conditionMemberSpan` and `entrySpan` in
// packages/shared/src/condition-groups.ts: a member covers the codes under its ends.
// Lists go in as one JSON parameter each (D1 binds at most 100).

export interface CodeGroup {
  id: number
  slug: string
  name: string
}

const END = sql.raw(`'${CODE_SPAN_END}'`)

/** The published groups with a member in the code's system that covers the code. */
export function codeGroups(db: Db, system: CodeSystem, codeNorm: string): Promise<CodeGroup[]> {
  return db.all<CodeGroup>(sql`SELECT DISTINCT g.id, g.slug, g.name
    FROM condition_members m JOIN condition_groups g ON g.id = m.group_id
    WHERE g.status = 'published' AND m.code_system = ${system} AND m.code_norm <= ${codeNorm}
      AND ${codeNorm} <= coalesce(m.range_end_norm, m.code_norm) || ${END}
    ORDER BY g.name, g.id`)
}

interface LikeRow {
  state_id: string
  group_id: number
  total: number
  code_system: CodeSystem
  raw_code: string
  code_norm: string
  match_kind: MatchKind
  range_end_norm: string | null
  includes_children: number | null
  description_published: string | null
  state_category: string
  state_subcategory: string
  source_locator: string | null
  source_title: string
  source_url: string | null
  source_date: string | null
}

/**
 * Per state (of `stateIds`), per group: its published entries in the groups' members of other
 * code systems, the first `LIKE_CODES_PER_GROUP` by code system and code, with the total.
 */
export async function likeCodes(
  db: Db,
  system: CodeSystem,
  groups: readonly CodeGroup[],
  stateIds: readonly string[],
): Promise<Map<string, LikeCodeMatch[]>> {
  const out = new Map<string, LikeCodeMatch[]>()
  if (groups.length === 0 || stateIds.length === 0) return out
  const rows = await db.all<LikeRow>(sql`WITH RECURSIVE
    lens(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM lens WHERE k < 40),
    pub AS MATERIALIZED (SELECT id AS state_id, published_version_id AS vid FROM states
      WHERE published_version_id IS NOT NULL
        AND id IN (SELECT value FROM json_each(${JSON.stringify(stateIds)}))),
    mem AS MATERIALIZED (SELECT group_id, code_system AS sys, code_norm AS lo,
        coalesce(range_end_norm, code_norm) || ${END} AS hi
      FROM condition_members
      WHERE group_id IN (SELECT value FROM json_each(${JSON.stringify(groups.map((g) => g.id))}))
        AND code_system <> ${system}),
    ranges AS MATERIALIZED (SELECT p.state_id, e.id, e.code_system, e.code_norm,
        e.range_end_norm || CASE WHEN e.includes_children = 1 THEN ${END} ELSE '' END AS hi
      FROM pub p JOIN entries e ON e.version_id = p.vid
      WHERE e.match_kind = 'range' AND e.code_system IN (SELECT sys FROM mem)),
    hit AS (
      -- Entries that start inside the member: a range scan of entries_version_code_idx.
      SELECT m.group_id, p.state_id, e.id AS entry_id
      FROM mem m CROSS JOIN pub p
      JOIN entries e ON e.version_id = p.vid AND e.code_norm >= m.lo AND e.code_norm <= m.hi
      WHERE e.code_system = m.sys
      UNION
      -- Wildcards that start before it: each shorter prefix of the member's first code.
      SELECT m.group_id, p.state_id, e.id
      FROM mem m CROSS JOIN lens n CROSS JOIN pub p
      JOIN entries e ON e.version_id = p.vid AND e.code_norm = substr(m.lo, 1, n.k)
      WHERE n.k < length(m.lo) AND e.code_system = m.sys
        AND (e.match_kind = 'prefix' OR e.includes_children = 1)
      UNION
      -- Ranges that start before it and reach into it.
      SELECT m.group_id, g.state_id, g.id
      FROM mem m JOIN ranges g ON g.code_system = m.sys AND g.code_norm < m.lo AND g.hi >= m.lo),
    ranked AS (
      SELECT h.group_id, h.state_id, h.entry_id,
        row_number() OVER (PARTITION BY h.state_id, h.group_id
          ORDER BY e.code_system, e.code_norm, e.id) AS rn,
        count(*) OVER (PARTITION BY h.state_id, h.group_id) AS total
      FROM hit h JOIN entries e ON e.id = h.entry_id)
    SELECT r.state_id, r.group_id, r.total, e.code_system, e.raw_code, e.code_norm, e.match_kind,
      e.range_end_norm, e.includes_children, e.description_published, e.state_category,
      e.state_subcategory, e.source_locator, d.title AS source_title, d.url AS source_url,
      d.publisher_date AS source_date
    FROM ranked r
    JOIN entries e ON e.id = r.entry_id
    JOIN source_documents d ON d.id = e.source_document_id
    WHERE r.rn <= ${LIKE_CODES_PER_GROUP}
    ORDER BY r.state_id, r.group_id, r.rn`)

  for (const g of groups) {
    for (const r of rows.filter((row) => row.group_id === g.id)) {
      const list = out.get(r.state_id) ?? []
      let match = list.find((l) => l.group.slug === g.slug)
      if (!match) {
        match = { group: { slug: g.slug, name: g.name }, total: r.total, entries: [] }
        list.push(match)
        out.set(r.state_id, list)
      }
      match.entries.push({
        codeSystem: r.code_system,
        rawCode: r.raw_code,
        display: displayEntryCode({
          codeSystem: r.code_system,
          codeNorm: r.code_norm,
          matchKind: r.match_kind,
          rangeEndNorm: r.range_end_norm,
          includesChildren: r.includes_children === 1 ? 1 : r.includes_children === 0 ? 0 : null,
        }),
        description:
          r.description_published !== null && r.description_published.trim() !== ''
            ? r.description_published
            : null,
        stateCategory: r.state_category,
        stateSubcategory: r.state_subcategory,
        source: {
          title: r.source_title,
          url: r.source_url,
          publisherDate: r.source_date,
          locator: r.source_locator,
        },
      })
    }
  }
  return out
}
