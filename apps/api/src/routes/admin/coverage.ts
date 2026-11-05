import {
  type CoverageRebuildCursor,
  coverageRebuildRequestSchema,
  coverageRebuildResponseSchema,
  type CoverageRebuildStep,
  coverageRebuildStepSchema,
} from '@mfcd/shared'
import { asc, count, isNotNull, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import {
  loadPlacementCategories,
  type PlacementCategories,
  recomputePlacements,
  universeStatements,
} from '../../db/placement'
import {
  entryUnified,
  states,
  stateSimilarity,
  unifiedCategories,
  unifiedUniverse,
} from '../../db/schema'
import { recomputeSimilarity } from '../../db/similarity'
import type { AppEnv } from '../../types'
import { actorOf } from './request'

// "Rebuild coverage" (docs/deployment.md, "Preview data"). Admin writes keep the derived tables
// current one change at a time; this rebuilds all of them from the base rows: after seed data
// loaded as SQL, and after a new CCSR or ICD-10-CM release. Each unit writes only the
// difference, so a second run changes nothing. Mounted at /api/admin/coverage.
//
// Why it runs in steps (2026-11-04): it used to put every category's universe in one D1 batch,
// which is one transaction, and on preview D1 stopped it ("exceeded its CPU time limit and was
// reset"). Now the work is split into small units, each its own statement or batch:
//   1. universe: one category's full code list (one batch, ~0.05 s on preview);
//   2. placements: one state's entries (`recomputePlacements` for that state; one batch);
//   3. similarity: one state's pairs with each state after it (one statement, ~0.5 s for the
//      largest on preview, where 44 states have lists).
// A call runs a bounded number of units (below), then answers with progress and the cursor of
// its last unit; the admin page calls again until `done`. Resumable calls rather than
// all units in one request, because one request would grow with the data (51 states with
// thousands of entries each) towards the Worker's CPU limit and the 100 s proxy timeout, and
// the cursor costs little: the units are listed again on every call, and a unit that finished
// stays finished. A failed call leaves every earlier unit done; pressing the button again starts
// over, which is safe because each unit writes only what changed.

//
// Why each call is small (2026-11-05): with 5 s of units per call, preview answered "D1 DB is
// overloaded. Too many resources consumed within a 10 second window" during placements, right
// after the universe step. D1 limits load over a 10-second window, not one query. Measured on
// preview (read-only, rows read and D1's SQL time per unit):
//   - universe: one category ~95k rows and ~35 ms, run twice (delete and insert), so ~70 ms;
//   - placements: one state (largest 353 entries) ~6.3k rows, ~25 ms in about 6 requests, most
//     of it the state's ref_ccsr ranges (~4.4k rows); at most a few hundred rows written;
//   - similarity: one state's pairs 34k to 680k rows, 30 to 550 ms (the first states cost most).
// So a call now stops when its units' weights reach CALL_WEIGHT (about 0.5 s of D1 time: 5
// categories, 10 states' placements or 1 state's pairs), or after BUDGET_MS of wall time,
// whichever comes first, and the admin page pauses between calls (unified.vue) so D1's window
// recovers. If D1 still answers "overloaded", the error carries `retryable: true` and the page
// waits and sends the same cursor again.

/** Wall time per call before it stops at a unit's end (a unit never splits). */
const BUDGET_MS = 2000

/** Each unit's share of a call, roughly in proportion to its D1 time (see above). */
const UNIT_WEIGHT: Record<CoverageRebuildStep, number> = {
  universe: 2,
  placements: 1,
  similarity: 10,
}
/** The most weight one call runs; the first unit always runs, whatever its weight. */
const CALL_WEIGHT = 10

const stepOrder = coverageRebuildStepSchema.options

interface Unit {
  step: CoverageRebuildStep
  /** A category id (as text) or a state id; '' only for similarity with no state listed. */
  key: string
}

/** Every unit, in order. Category ids sort as numbers, state ids as text. */
async function listUnits(db: Db): Promise<{ units: Unit[]; categories: number }> {
  const [categories, allStates, listed] = await db.batch([
    db
      .select({ id: unifiedCategories.id })
      .from(unifiedCategories)
      .where(ne(unifiedCategories.status, 'retired'))
      .orderBy(asc(unifiedCategories.id)),
    db.select({ id: states.id }).from(states).orderBy(asc(states.id)),
    db
      .select({ id: states.id })
      .from(states)
      .where(isNotNull(states.publishedVersionId))
      .orderBy(asc(states.id)),
  ])
  // With no list at all, one similarity unit still deletes the pairs left over.
  const similarity = listed.length > 0 ? listed.map((s) => s.id) : ['']
  return {
    categories: categories.length,
    units: [
      ...categories.map((u) => ({ step: 'universe' as const, key: String(u.id) })),
      ...allStates.map((s) => ({ step: 'placements' as const, key: s.id })),
      ...similarity.map((key) => ({ step: 'similarity' as const, key })),
    ],
  }
}

const compareKeys = (step: CoverageRebuildStep, a: string, b: string) =>
  step === 'universe' ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0

/** Index of the first unit after the cursor (it still works when that unit is gone). */
function startIndex(units: Unit[], cursor: CoverageRebuildCursor | undefined): number {
  if (!cursor) return 0
  const at = stepOrder.indexOf(cursor.step)
  const i = units.findIndex((u) => {
    const order = stepOrder.indexOf(u.step)
    return order > at || (order === at && compareKeys(u.step, u.key, cursor.after) > 0)
  })
  return i === -1 ? units.length : i
}

async function runUnit(
  db: Db,
  unit: Unit,
  placementCategories: () => Promise<PlacementCategories>,
): Promise<void> {
  if (unit.step === 'universe') {
    await db.batch([
      ...universeStatements(db, sql<number>`${Number(unit.key)}`),
      bumpDataVersion(db),
    ])
  } else if (unit.step === 'placements') {
    await recomputePlacements(
      db,
      { stateIds: [unit.key] },
      { categories: await placementCategories() },
    )
  } else {
    await recomputeSimilarity(db, { pairsAfter: unit.key })
  }
}

export const coverageRoute = new Hono<AppEnv>().post('/rebuild', async (c) => {
  const started = Date.now()
  const body = coverageRebuildRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid request' }, 400)
  const budget = body.data.budgetMs ?? BUDGET_MS
  const db = createDb(c.env.DB)

  const { units, categories: categoryCount } = await listUnits(db)
  let i = startIndex(units, body.data.cursor)
  // Categories and CCSR groups are the same for every state: read them once per call.
  let categories: Promise<PlacementCategories> | undefined
  const placementCategories = () => (categories ??= loadPlacementCategories(db))
  let weight = 0
  for (;;) {
    const unit = units[i]
    if (!unit) break
    const next = weight + UNIT_WEIGHT[unit.step]
    if (weight > 0 && (next > CALL_WEIGHT || Date.now() - started >= budget)) break
    await runUnit(db, unit, placementCategories)
    weight = next
    i += 1
  }
  const done = i >= units.length
  const last = units[i - 1] ?? units.at(-1)
  const step = last?.step ?? 'similarity'
  const inStep = units.filter((u) => u.step === step)

  const [[codes], [placements], [pairs]] = await db.batch([
    db.select({ n: count() }).from(unifiedUniverse),
    db.select({ n: count() }).from(entryUnified),
    db.select({ n: count() }).from(stateSimilarity),
  ])
  const result = coverageRebuildResponseSchema.parse({
    done,
    next: done || !last ? null : { step: last.step, after: last.key },
    progress: {
      step,
      completed: last ? inStep.indexOf(last) + 1 : 0,
      total: inStep.length,
    },
    categories: categoryCount,
    universeCodes: codes?.n ?? 0,
    placements: placements?.n ?? 0,
    similarPairs: pairs?.n ?? 0,
    ms: Date.now() - started,
  })
  if (done) {
    await auditInsert(db, {
      actorEmail: actorOf(c),
      action: 'coverage.rebuild',
      target: 'coverage:all',
      details: {
        categories: result.categories,
        universeCodes: result.universeCodes,
        placements: result.placements,
        similarPairs: result.similarPairs,
      },
    })
  }
  return c.json(result)
})
