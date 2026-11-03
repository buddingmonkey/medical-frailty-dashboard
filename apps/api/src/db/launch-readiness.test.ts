import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { ADMIN } from '../test/access-fixtures'
import { send } from '../test/draft-fixtures'
import { seedOverview } from '../test/overview-fixtures'
import { createDb } from './client'
import { launchReadiness } from './launch-readiness'
import { categoryMappings, unifiedCategories } from './schema'

// Launch readiness (roadmap M8 step 1) on the overview fixture (see its file): MT has both
// categories approved; GA's Behavioral Health has no unified mapping (placed by CCSR, not
// reviewed) and its DME is approved; NE has only a draft; LA has no list.

const db = createDb(env.DB)

async function map(stateCategory: string, unifiedId: number, approve: boolean) {
  const res = await send('PUT', '/api/admin/states/GA/unified-mappings', {
    stateCategory,
    stateSubcategory: '',
    approve,
    targets: [{ unifiedId, relation: 'exact', basis: 'state_text', confidence: 'high' }],
  })
  expect(res.status).toBe(200)
}

let ids: Awaited<ReturnType<typeof seedOverview>>

beforeEach(async () => {
  ids = await seedOverview()
})

describe('launchReadiness', () => {
  it('lists only states with a published list, drafts ignored', async () => {
    const body = await launchReadiness(db)
    expect(body.states.map((s) => s.stateId)).toEqual(['GA', 'MT'])
    expect(body.states.every((s) => s.versionNo === 1)).toBe(true)
  })

  it('counts each layer and applies the gate', async () => {
    await db.insert(categoryMappings).values([
      {
        stateId: 'GA',
        stateCategory: 'dme ',
        federalCategory: 'physical_idd_adl',
        method: 'manual',
        mappedBy: ADMIN,
      },
      {
        stateId: 'GA',
        stateCategory: 'Behavioral Health',
        federalCategory: 'disabling_mental_disorder',
        method: 'auto',
        confidence: 0.7,
      },
      { stateId: 'MT', stateCategory: 'SMI', federalCategory: 'unmapped', method: 'auto' },
    ])
    const body = await launchReadiness(db)
    expect(body.states).toMatchObject([
      {
        stateId: 'GA',
        name: 'Georgia',
        categories: 2,
        unified: { unmapped: 1, unconfirmed: 0 },
        federal: { unmapped: 0, auto: 1 },
        notReviewed: 1,
        ready: false,
      },
      {
        stateId: 'MT',
        name: 'Montana',
        categories: 2,
        unified: { unmapped: 0, unconfirmed: 0 },
        federal: { unmapped: 2, auto: 1 },
        notReviewed: 0,
        ready: true,
      },
    ])
    expect(body).toMatchObject({ readyCount: 1, required: 2, gatePassed: false })
  })

  it('counts a proposed mapping as unconfirmed, and an approval as ready', async () => {
    await map('Behavioral Health', ids.smi, false)
    let ga = (await launchReadiness(db)).states.find((s) => s.stateId === 'GA')
    expect(ga).toMatchObject({ unified: { unmapped: 0, unconfirmed: 1 }, ready: false })

    await map('Behavioral Health', ids.smi, true)
    const body = await launchReadiness(db)
    ga = body.states.find((s) => s.stateId === 'GA')
    expect(ga).toMatchObject({ unified: { unmapped: 0, unconfirmed: 0 }, notReviewed: 0 })
    expect(body).toMatchObject({ readyCount: 2, gatePassed: true })
  })

  it('follows the public review status where the unified layer looks done', async () => {
    // Approved to a draft unified category: its codes still go by CCSR into a published
    // category, unreviewed, so the public page shows "Not yet reviewed" and the state is not
    // ready, even with a manual federal mapping.
    const [draft] = await db
      .select({ id: unifiedCategories.id })
      .from(unifiedCategories)
      .where(eq(unifiedCategories.status, 'draft'))
    if (!draft) throw new Error('fixture')
    await map('Behavioral Health', draft.id, true)
    await db.insert(categoryMappings).values({
      stateId: 'GA',
      stateCategory: 'Behavioral Health',
      federalCategory: 'disabling_mental_disorder',
      method: 'manual',
      mappedBy: ADMIN,
    })
    const ga = (await launchReadiness(db)).states.find((s) => s.stateId === 'GA')
    expect(ga).toMatchObject({ unified: { unmapped: 0, unconfirmed: 0 }, notReviewed: 1 })
    expect(ga?.ready).toBe(false)
  })
})
