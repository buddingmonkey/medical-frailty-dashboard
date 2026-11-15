import {
  buildOverlaps,
  type CodeSystem,
  codeUrlPath,
  displayEntryCode,
  type MatchKind,
  type OverlapsResponse,
  overlapsResponseSchema,
} from '@mfcd/shared'
import { sql } from 'drizzle-orm'

import type { Db } from './client'
import { categoryContext, patternOf, placedRows, shared } from './public-drill'

// The Overlaps tab (project lead, 2026-11-12): for each row the drill-down counts
// (src/db/public-drill.ts: the codes, wildcards and ranges placed in the category), the states
// with a list that include it, from the drill's own `best` (listed, or covered by a wildcard or
// range). One query; `buildOverlaps` in packages/shared groups the rows into exclusive
// intersections.

interface Row {
  rk: string
  sys: CodeSystem
  kind: MatchKind
  norm: string
  end_norm: string | null
  wild: number
  state_ids: string
}

/** The category's overlaps; null when the slug is not a published unified category. */
export async function publicOverlaps(
  db: Db,
  slug: string,
  dataVersion: number,
): Promise<OverlapsResponse | null> {
  const context = await categoryContext(db, slug)
  if (!context) return null
  const { category } = context
  const rows = await db.all<Row>(sql`${shared(placedRows(category.id, false))}
    SELECT r.rk, r.sys, r.kind, r.norm, r.end_norm, r.wild, group_concat(b.state_id) AS state_ids
    FROM drows r JOIN best b ON b.rk = r.rk
    GROUP BY r.rk`)
  const withList = context.states.filter((s) => s.vid !== null)
  return overlapsResponseSchema.parse({
    dataVersion,
    category: {
      id: category.id,
      slug: category.slug,
      label: category.label,
      federalCategory: category.federalCategory,
    },
    ...buildOverlaps(
      rows.map((r) => {
        const pattern = patternOf(r)
        return {
          key: r.rk,
          codeSystem: r.sys,
          codeNorm: r.norm,
          matchKind: r.kind,
          rangeEndNorm: pattern.rangeEndNorm,
          display: displayEntryCode(pattern),
          codePath: r.kind === 'exact' ? codeUrlPath(r.sys, r.norm) : null,
          stateIds: r.state_ids.split(','),
        }
      }),
      withList.map(({ id, slug: s, name }) => ({ id, slug: s, name })),
    ),
  })
}
