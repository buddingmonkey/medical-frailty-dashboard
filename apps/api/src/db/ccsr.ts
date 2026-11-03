import { type CcsrIndex, ccsrIndex, ccsrKeyRanges } from '@mfcd/shared'
import { and, or, sql } from 'drizzle-orm'

import type { Db } from './client'
import { refCcsr } from './schema'

// The `ref_ccsr` rows a set of ICD-10-CM entries needs (docs/data-model.md, "CCSR reference
// data"), read as primary-key range scans: one per ICD-10-CM category the entries touch. Used by
// the mapping screen's suggestions and by placement (src/db/placement.ts).

/** D1 binds at most 100 parameters per query: 2 per key range. */
const RANGES_PER_QUERY = 49

export async function loadCcsrIndex(
  db: Db,
  icdEntries: readonly { codeNorm: string; rangeEndNorm: string | null }[],
): Promise<CcsrIndex> {
  const ranges = ccsrKeyRanges(icdEntries)
  const queries = []
  for (let i = 0; i < ranges.length; i += RANGES_PER_QUERY) {
    const chunk = ranges.slice(i, i + RANGES_PER_QUERY)
    queries.push(
      db
        .select({
          codeNorm: refCcsr.codeNorm,
          ccsrCategory: refCcsr.ccsrCategory,
          isDefault: refCcsr.isDefault,
        })
        .from(refCcsr)
        .where(
          or(
            ...chunk.map((r) =>
              and(sql`${refCcsr.codeNorm} >= ${r.from}`, sql`${refCcsr.codeNorm} < ${r.to}`),
            ),
          ),
        ),
    )
  }
  const [firstQuery, ...moreQueries] = queries
  const rows = firstQuery ? (await db.batch([firstQuery, ...moreQueries])).flat() : []
  return ccsrIndex(rows.map((r) => ({ ...r, isDefault: r.isDefault === 1 ? 1 : 0 })))
}
