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
import { recomputePlacements, universeStatements } from '../../db/placement'
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
// A call runs units until BUDGET_MS of wall time has passed, then answers with progress and the
// cursor of its last unit; the admin page calls again until `done`. Resumable calls rather than
// all units in one request, because one request would grow with the data (51 states with
// thousands of entries each) towards the Worker's CPU limit and the 100 s proxy timeout, and
// the cursor costs little: the units are listed again on every call, and a unit that finished
// stays finished. A failed call leaves every earlier unit done; pressing the button again starts
// over, which is safe because each unit writes only what changed.

/** Wall time per call before it stops at a unit's end (a unit never splits). */
const BUDGET_MS = 5000

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

async function runUnit(db: Db, unit: Unit): Promise<void> {
  if (unit.step === 'universe') {
    await db.batch([
      ...universeStatements(db, sql<number>`${Number(unit.key)}`),
      bumpDataVersion(db),
    ])
  } else if (unit.step === 'placements') {
    await recomputePlacements(db, { stateIds: [unit.key] })
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

  const { units, categories } = await listUnits(db)
  let i = startIndex(units, body.data.cursor)
  if (i < units.length) {
    do {
      const unit = units[i]
      if (unit) await runUnit(db, unit)
      i += 1
    } while (i < units.length && Date.now() - started < budget)
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
    categories,
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
