import { coverageRebuildResponseSchema } from '@mfcd/shared'
import { count, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import { recomputePlacements, universeStatements } from '../../db/placement'
import { stateSimilarity, unifiedCategories, unifiedUniverse } from '../../db/schema'
import { recomputeSimilarity } from '../../db/similarity'
import type { AppEnv } from '../../types'

// "Rebuild coverage" (docs/deployment.md, "Preview data"). Admin writes keep the derived tables
// current one change at a time; this rebuilds all of them from the base rows: after seed data
// loaded as SQL, and after a new CCSR or ICD-10-CM release. Each step writes only the
// difference, so a second run changes nothing. Mounted at /api/admin/coverage.

export const coverageRoute = new Hono<AppEnv>().post('/rebuild', async (c) => {
  const started = Date.now()
  const db = createDb(c.env.DB)
  const categories = await db
    .select({ id: unifiedCategories.id })
    .from(unifiedCategories)
    .where(ne(unifiedCategories.status, 'retired'))
  // 1. Each category's full code list (also drafts, for the admin preview).
  const universe = categories.flatMap((u) => universeStatements(db, sql<number>`${u.id}`))
  const [first, ...rest] = universe
  if (first) await db.batch([first, ...rest, bumpDataVersion(db)])
  // 2. Placements, then pair similarity (it reads the placements' codes), in every state.
  const placements = await recomputePlacements(db, 'all')
  await recomputeSimilarity(db, 'all')

  const [[codes], [pairs]] = await db.batch([
    db.select({ n: count() }).from(unifiedUniverse),
    db.select({ n: count() }).from(stateSimilarity),
  ])
  const result = coverageRebuildResponseSchema.parse({
    categories: categories.length,
    universeCodes: codes?.n ?? 0,
    placements: placements.placements,
    similarPairs: pairs?.n ?? 0,
    ms: Date.now() - started,
  })
  await auditInsert(db, {
    actorEmail: c.var.identity?.email ?? '',
    action: 'coverage.rebuild',
    target: 'coverage:all',
    details: result,
  })
  return c.json(result)
})
