import { unifiedSaveResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { ADMIN } from '../test/access-fixtures'
import { draftWith, entry, publishAll, send, sourceIds } from '../test/draft-fixtures'
import { resetDb } from '../test/reset-db'
import { createDb } from './client'
import {
  appMeta,
  datasetVersions,
  entries,
  entryUnified,
  refCcsr,
  refCcsrCategories,
  refCodes,
  sourceDocuments,
  states,
  unifiedCategories,
  unifiedUniverse,
} from './schema'

// Placements (entry_unified) and universes (unified_universe), roadmap M5 step 4: recomputed
// after publish, rollback, mapping approval and unified category changes. CCSR ids are made up
// (TST…), never AHRQ data.

const db = createDb(env.DB)

/** Every placement of a state's entries, any version: [code, slug, basis, reviewed]. */
async function placements(stateId: string) {
  const rows = await db
    .select({
      code: entries.codeNorm,
      slug: unifiedCategories.slug,
      basis: entryUnified.basis,
      reviewed: entryUnified.reviewed,
      versionId: entries.versionId,
    })
    .from(entryUnified)
    .innerJoin(entries, eq(entries.id, entryUnified.entryId))
    .innerJoin(datasetVersions, eq(datasetVersions.id, entries.versionId))
    .innerJoin(unifiedCategories, eq(unifiedCategories.id, entryUnified.unifiedId))
    .where(eq(datasetVersions.stateId, stateId))
    .orderBy(asc(entries.codeNorm), asc(unifiedCategories.slug))
  return rows.map((r) => [r.code, r.slug, r.basis, r.reviewed])
}

async function universe(slug: string) {
  const rows = await db
    .select({ code: unifiedUniverse.codeNorm })
    .from(unifiedUniverse)
    .innerJoin(unifiedCategories, eq(unifiedCategories.id, unifiedUniverse.unifiedId))
    .where(eq(unifiedCategories.slug, slug))
    .orderBy(asc(unifiedUniverse.codeNorm))
  return rows.map((r) => r.code)
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return Number(row?.value ?? 0)
}

const categoryBody = {
  definition: 'Test category.',
  federalCategory: 'disabling_mental_disorder',
  includes: null,
  excludes: null,
  sortOrder: 0,
}

async function createCategory(label: string, ccsr: string[], status = 'published') {
  const res = await send('POST', '/api/admin/unified', { ...categoryBody, label, ccsr, status })
  expect(res.status).toBe(201)
  return unifiedSaveResponseSchema.parse(await res.json()).id
}

async function editCategory(id: number, label: string, ccsr: string[], status: string) {
  const res = await send('PUT', `/api/admin/unified/${String(id)}`, {
    ...categoryBody,
    label,
    ccsr,
    status,
  })
  expect(res.status).toBe(200)
}

async function mapCategory(
  stateId: string,
  stateCategory: string,
  target: number | 'by_code',
  approve: boolean,
) {
  const res = await send('PUT', `/api/admin/states/${stateId}/unified-mappings`, {
    stateCategory,
    stateSubcategory: '',
    approve,
    ...(target === 'by_code'
      ? { byCode: true }
      : {
          targets: [
            { unifiedId: target, relation: 'exact', basis: 'state_text', confidence: 'high' },
          ],
        }),
  })
  expect(res.status).toBe(200)
}

async function publish(stateId: string, rows: Parameters<typeof draftWith>[1]) {
  const id = await draftWith(stateId, rows)
  expect((await publishAll(id, stateId)).status).toBe(200)
  return id
}

let smi = 0
let kidney = 0

beforeEach(async () => {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  for (const stateId of ['MT', 'NE']) {
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        stateId,
        title: `${stateId} list`,
        fileType: 'pdf',
        sha256: stateId.repeat(32),
        r2Key: `sources/${stateId}`,
        byteSize: 10,
        uploadedBy: ADMIN,
      })
      .returning()
    sourceIds[stateId] = doc?.id ?? 0
  }
  await db.insert(refCcsrCategories).values(
    ['TST001', 'TST002', 'TST003', 'TST009'].map((ccsrCategory) => ({
      ccsrCategory,
      description: `Test ${ccsrCategory}`,
      bodySystem: 'Test',
      release: 'ccsr-dx-test',
    })),
  )
  // F32 has TST003, but its child F321 has TST009 only (longest prefix wins).
  await db.insert(refCcsr).values(
    [
      ['F20', 'TST001'],
      ['F31', 'TST002'],
      ['F32', 'TST003'],
      ['F321', 'TST009'],
      ['N18', 'TST009'],
    ].map(([codeNorm = '', ccsrCategory = '']) => ({
      codeNorm,
      ccsrCategory,
      isDefault: 1,
      release: 'ccsr-dx-test',
    })),
  )
  const code = (codeNorm: string, billable: number, validTo: string | null = null) => ({
    codeSystem: 'icd10cm' as const,
    codeNorm,
    description: `Code ${codeNorm}`,
    billable,
    validFrom: '2026-10-01',
    validTo,
  })
  await db
    .insert(refCodes)
    .values([
      code('F20', 0),
      code('F200', 1),
      code('F201', 1),
      code('F208', 1, '2026-09-30'),
      code('F3110', 1),
      code('F320', 1),
      code('F321', 1),
      code('N186', 1),
    ])
  smi = await createCategory('Serious mental illness', ['TST001', 'TST002'])
  kidney = await createCategory('Kidney failure', ['TST009'], 'draft')
})

describe('placements (entry_unified)', () => {
  it('places a list with no mappings by CCSR group (by_code, not reviewed)', async () => {
    await publish('MT', [
      entry('F20.0'),
      entry('F31.10'),
      entry('N18.6'),
      entry('E0601', { codeSystem: 'hcpcs', stateCategory: 'DME' }),
    ])
    // N18.6 belongs to a draft category only; E0601 has no CCSR group and no mapping.
    expect(await placements('MT')).toEqual([
      ['F200', 'serious-mental-illness', 'by_code', 0],
      ['F3110', 'serious-mental-illness', 'by_code', 0],
    ])
  })

  it('follows the published version on publish and rollback, and leaves drafts out', async () => {
    const first = await publish('MT', [entry('F20.0')])
    await publish('MT', [entry('F31.10')])
    await draftWith('MT', [entry('F20.1')])
    expect(await placements('MT')).toEqual([['F3110', 'serious-mental-illness', 'by_code', 0]])

    const res = await send('POST', '/api/admin/states/MT/rollback', { versionId: first })
    expect(res.status).toBe(200)
    expect(await placements('MT')).toEqual([['F200', 'serious-mental-illness', 'by_code', 0]])
  })

  it('places by an approved mapping, never a proposed one', async () => {
    await publish('MT', [
      entry('F20.0'),
      entry('N18.6'),
      entry('F20.1', { stateCategory: 'Other' }),
    ])
    await mapCategory('MT', 'SMI', smi, false)
    expect(await placements('MT')).toEqual([
      ['F200', 'serious-mental-illness', 'by_code', 0],
      ['F201', 'serious-mental-illness', 'by_code', 0],
    ])

    const before = await dataVersion()
    const approve = await send('POST', '/api/admin/states/MT/unified-mappings/approve', {
      stateCategory: 'SMI',
      stateSubcategory: '',
    })
    expect(approve.status).toBe(200)
    expect(await placements('MT')).toEqual([
      ['F200', 'serious-mental-illness', 'mapping', 1],
      ['F201', 'serious-mental-illness', 'by_code', 0],
      ['N186', 'serious-mental-illness', 'mapping', 1],
    ])
    // The approval's own bump, then one more once the placements are written.
    expect(await dataVersion()).toBe(before + 2)

    // Saving an approved by_code row marks the category's placements reviewed.
    await mapCategory('MT', 'Other', 'by_code', true)
    expect(await placements('MT')).toContainEqual(['F201', 'serious-mental-illness', 'by_code', 1])
  })

  it('counts a draft category only once it is published, and drops it when retired', async () => {
    await publish('MT', [entry('N18.6'), entry('F20.0')])
    expect(await placements('MT')).toEqual([['F200', 'serious-mental-illness', 'by_code', 0]])

    await editCategory(kidney, 'Kidney failure', ['TST009'], 'published')
    expect(await placements('MT')).toEqual([
      ['F200', 'serious-mental-illness', 'by_code', 0],
      ['N186', 'kidney-failure', 'by_code', 0],
    ])
    await editCategory(kidney, 'Kidney failure', ['TST009'], 'retired')
    expect(await placements('MT')).toEqual([['F200', 'serious-mental-illness', 'by_code', 0]])
  })

  it('moves entries when a category’s CCSR set changes, in every state with a list', async () => {
    await publish('MT', [entry('F20.0'), entry('F31.10')])
    await publish('NE', [entry('F31.10')])
    await editCategory(smi, 'Serious mental illness', ['TST001'], 'published')
    expect(await placements('MT')).toEqual([['F200', 'serious-mental-illness', 'by_code', 0]])
    expect(await placements('NE')).toEqual([])
  })

  it('changes nothing in other states when one state’s mapping is approved', async () => {
    await publish('MT', [entry('F20.0')])
    await publish('NE', [entry('F20.0'), entry('F31.10')])
    const ne = await placements('NE')
    await mapCategory('MT', 'SMI', smi, true)
    expect(await placements('MT')).toEqual([['F200', 'serious-mental-illness', 'mapping', 1]])
    expect(await placements('NE')).toEqual(ne)
    expect(await placements('NE')).toEqual([
      ['F200', 'serious-mental-illness', 'by_code', 0],
      ['F3110', 'serious-mental-illness', 'by_code', 0],
    ])
  })

  it('writes nothing and keeps data_version when placements do not change', async () => {
    await publish('MT', [
      entry('F20.0'),
      entry('E0601', { codeSystem: 'hcpcs', stateCategory: 'DME' }),
    ])
    const before = await placements('MT')
    const version = await dataVersion()
    // A mapping to a draft category is no mapping on public pages: nothing moves.
    await mapCategory('MT', 'DME', kidney, true)
    expect(await placements('MT')).toEqual(before)
    expect(await dataVersion()).toBe(version + 1)
  })
})

describe('universes (unified_universe)', () => {
  it('holds every billable current ICD-10-CM code in the category’s CCSR groups', async () => {
    // F20 is a header, F208 was deleted from the code set: neither counts.
    expect(await universe('serious-mental-illness')).toEqual(['F200', 'F201', 'F3110'])
    // Drafts get a universe too, for admin previews; the longest prefix decides F321.
    expect(await universe('kidney-failure')).toEqual(['F321', 'N186'])
  })

  it('is rewritten when the CCSR set changes', async () => {
    await editCategory(smi, 'Serious mental illness', ['TST002', 'TST003'], 'published')
    expect(await universe('serious-mental-illness')).toEqual(['F3110', 'F320'])
    await editCategory(smi, 'Serious mental illness', [], 'published')
    expect(await universe('serious-mental-illness')).toEqual([])
  })
})
