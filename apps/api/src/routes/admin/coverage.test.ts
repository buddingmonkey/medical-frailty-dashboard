import {
  auditListResponseSchema,
  type CoverageRebuildRequest,
  type CoverageRebuildResponse,
  coverageRebuildResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { recomputeSimilarity } from '../../db/similarity'
import { appMeta, entryUnified, stateSimilarity, unifiedUniverse } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// "Rebuild coverage" (docs/deployment.md, "Preview data"): rebuilds every derived table from
// the base rows, for seed data loaded as SQL and for a new CCSR or ICD-10-CM release. It runs
// in bounded calls; the admin page calls again with `next` until `done`.
const db = createDb(env.DB)

async function derived() {
  return {
    universe: await db
      .select()
      .from(unifiedUniverse)
      .orderBy(asc(unifiedUniverse.unifiedId), asc(unifiedUniverse.codeNorm)),
    placements: await db
      .select()
      .from(entryUnified)
      .orderBy(asc(entryUnified.entryId), asc(entryUnified.unifiedId)),
    similarity: await db
      .select()
      .from(stateSimilarity)
      .orderBy(asc(stateSimilarity.stateA), asc(stateSimilarity.stateB)),
  }
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return Number(row?.value ?? 0)
}

const rebuildCall = async (body: CoverageRebuildRequest = {}) =>
  call('/api/admin/coverage/rebuild', { token: await accessToken(), method: 'POST', body })

/** Calls until done, as the admin page does; every answer in order. */
async function rebuildAll(budgetMs?: number): Promise<CoverageRebuildResponse[]> {
  const answers: CoverageRebuildResponse[] = []
  let cursor: CoverageRebuildRequest['cursor']
  for (let i = 0; i < 100; i++) {
    const res = await rebuildCall({
      ...(cursor ? { cursor } : {}),
      ...(budgetMs === undefined ? {} : { budgetMs }),
    })
    expect(res.status).toBe(200)
    const body = coverageRebuildResponseSchema.parse(await res.json())
    answers.push(body)
    if (body.done) return answers
    cursor = body.next ?? undefined
  }
  throw new Error('the rebuild never finished')
}

const numbers = (rows: { computedAt: string }[]) =>
  rows.map((pair) => ({ ...pair, computedAt: null }))

describe('POST /api/admin/coverage/rebuild', () => {
  beforeEach(async () => {
    await seedOverview()
    // The fixture publishes with SQL, so its pairs come from the incremental path here.
    await recomputeSimilarity(db, 'all')
  })

  it('refuses a request without a signed Access token', async () => {
    expect((await call('/api/admin/coverage/rebuild', { method: 'POST' })).status).toBe(401)
  })

  it('refuses a body it does not know', async () => {
    for (const body of [{ cursor: { step: 'all', after: '1' } }, { budgetMs: -1 }, { x: 1 }]) {
      const res = await call('/api/admin/coverage/rebuild', {
        token: await accessToken(),
        method: 'POST',
        body,
      })
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('rebuilds universes, placements and similarity to what the admin writes made', async () => {
    const before = await derived()
    expect(before.universe.length).toBeGreaterThan(0)
    expect(before.placements.length).toBeGreaterThan(0)
    expect(before.similarity.length).toBeGreaterThan(0)
    // What seed SQL leaves: base rows only.
    await db.delete(entryUnified)
    await db.delete(unifiedUniverse)
    await db.delete(stateSimilarity)
    const version = await dataVersion()

    const answers = await rebuildAll()
    expect(answers.at(-1)).toMatchObject({
      done: true,
      next: null,
      categories: 4,
      universeCodes: before.universe.length,
      placements: before.placements.length,
      similarPairs: before.similarity.length,
    })
    const after = await derived()
    expect(after.universe).toEqual(before.universe)
    expect(after.placements).toEqual(before.placements)
    // computed_at is when the numbers last changed: now, for rows written again.
    expect(numbers(after.similarity)).toEqual(numbers(before.similarity))
    expect(await dataVersion()).toBeGreaterThan(version)

    const audits = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    ).items
    expect(audits.filter((a) => a.action === 'coverage.rebuild')).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'coverage.rebuild', target: 'coverage:all' })
  })

  it('does one unit per call with no budget, reporting progress until done', async () => {
    const before = await derived()
    await db.delete(entryUnified)
    await db.delete(unifiedUniverse)
    await db.delete(stateSimilarity)

    const answers = await rebuildAll(0)
    // 4 categories (3 published, 1 draft), 4 states, 2 states with a list (GA, MT).
    expect(answers.map((a) => [a.progress.step, a.progress.completed, a.progress.total])).toEqual([
      ['universe', 1, 4],
      ['universe', 2, 4],
      ['universe', 3, 4],
      ['universe', 4, 4],
      ['placements', 1, 4],
      ['placements', 2, 4],
      ['placements', 3, 4],
      ['placements', 4, 4],
      ['similarity', 1, 2],
      ['similarity', 2, 2],
    ])
    expect(answers.slice(0, -1).every((a) => !a.done && a.next !== null)).toBe(true)
    expect(answers[4]?.next).toEqual({ step: 'placements', after: 'GA' })
    const after = await derived()
    expect(after.universe).toEqual(before.universe)
    expect(after.placements).toEqual(before.placements)
    expect(numbers(after.similarity)).toEqual(numbers(before.similarity))
  })

  it('bounds the work of one call, whatever its time budget', async () => {
    await db.delete(entryUnified)
    await db.delete(unifiedUniverse)
    await db.delete(stateSimilarity)

    // Weights: a category's full list 2, a state's placements 1, a state's pairs 10; at most 10
    // per call. So the 4 categories and 2 states' placements, then 2 placements (a pairs unit
    // would pass 10), then one state's pairs per call.
    const answers = await rebuildAll(60_000)
    expect(answers.map((a) => [a.progress.step, a.progress.completed, a.progress.total])).toEqual([
      ['placements', 2, 4],
      ['placements', 4, 4],
      ['similarity', 1, 2],
      ['similarity', 2, 2],
    ])
  })

  it('changes nothing when run twice', async () => {
    await rebuildAll()
    const once = await derived()
    const version = await dataVersion()
    await rebuildAll(0)
    expect(await derived()).toEqual(once)
    // Placements and similarity bump data_version only when something changed.
    expect(await dataVersion()).toBe(version + 4)
  })
})
