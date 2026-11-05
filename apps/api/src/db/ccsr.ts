import { type CcsrIndex, ccsrIndex, ccsrKeyRanges } from '@mfcd/shared'
import { and, or, sql } from 'drizzle-orm'

import type { Db } from './client'
import { chunk, D1_MAX_PARAMS } from './d1-limits'
import { refCcsr } from './schema'

// The `ref_ccsr` rows a set of ICD-10-CM entries needs (docs/data-model.md, "CCSR reference
// data"), read as primary-key range scans: one per ICD-10-CM category the entries touch. Used by
// the mapping screen's suggestions and by placement (src/db/placement.ts).

/** Key ranges per query: 2 bound parameters each, under D1's limit. */
const RANGES_PER_QUERY = Math.floor((D1_MAX_PARAMS - 1) / 2)

export async function loadCcsrIndex(
  db: Db,
  icdEntries: readonly { codeNorm: string; rangeEndNorm: string | null }[],
): Promise<CcsrIndex> {
  const ranges = ccsrKeyRanges(icdEntries)
  const queries = chunk(ranges, RANGES_PER_QUERY).map((part) =>
    db
      .select({
        codeNorm: refCcsr.codeNorm,
        ccsrCategory: refCcsr.ccsrCategory,
        isDefault: refCcsr.isDefault,
      })
      .from(refCcsr)
      .where(
        or(
          ...part.map((r) =>
            and(sql`${refCcsr.codeNorm} >= ${r.from}`, sql`${refCcsr.codeNorm} < ${r.to}`),
          ),
        ),
      ),
  )
  const [firstQuery, ...moreQueries] = queries
  const rows = firstQuery ? (await db.batch([firstQuery, ...moreQueries])).flat() : []
  return ccsrIndex(rows.map((r) => ({ ...r, isDefault: r.isDefault === 1 ? 1 : 0 })))
}
