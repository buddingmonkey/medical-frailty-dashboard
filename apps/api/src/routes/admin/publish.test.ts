import {
  auditListResponseSchema,
  publishResponseSchema,
  rollbackResponseSchema,
  versionListResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDb } from '../../db/client'
import { publishedEntries } from '../../db/published'
import {
  appMeta,
  categoryMappings,
  datasetVersions,
  draftParts,
  entries,
  refCodes,
  sourceDocuments,
  states,
  versionSources,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { checksOf, draftWith, entry, publishAll, send, sourceIds } from '../../test/draft-fixtures'
import { failingD1 } from '../../test/failing-d1'
import { resetDb } from '../../test/reset-db'

// Publish and rollback (docs/data-model.md, "Replacing a state's list"), including the
// required tests in docs/testing.md: per-state isolation, typed confirmation, exact rollback.

const db = createDb(env.DB)

async function statusOf(id: number) {
  const [row] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, id))
  return row?.status
}

/** Every row that belongs to a state, for the isolation test. */
async function snapshotState(stateId: string) {
  const versions = await db
    .select()
    .from(datasetVersions)
    .where(eq(datasetVersions.stateId, stateId))
  const ids = versions.map((v) => v.id)
  return {
    state: await db.select().from(states).where(eq(states.id, stateId)),
    versions,
    entries: ids.length
      ? await db.select().from(entries).where(inArray(entries.versionId, ids))
      : [],
    parts: ids.length
      ? await db.select().from(draftParts).where(inArray(draftParts.versionId, ids))
      : [],
    links: ids.length
      ? await db.select().from(versionSources).where(inArray(versionSources.versionId, ids))
      : [],
    mappings: await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, stateId)),
  }
}

/**
 * `real`, except that the first two publish-sized batches (5+ statements) are held until both
 * have been sent, then run one after the other: a double submit that passed the checks twice.
 */
function racingBatches(real: D1Database): D1Database {
  let secondSent = (): void => undefined
  const bothSent = new Promise<void>((resolve) => {
    secondSent = resolve
  })
  let firstDone = (): void => undefined
  const firstFinished = new Promise<void>((resolve) => {
    firstDone = resolve
  })
  let held = 0
  const batch = async (statements: D1PreparedStatement[]) => {
    if (statements.length < 5 || held >= 2) return real.batch(statements)
    held++
    if (held === 1) {
      await bothSent
      try {
        return await real.batch(statements)
      } finally {
        firstDone()
      }
    }
    secondSent()
    await firstFinished
    return real.batch(statements)
  }
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'batch') return batch
      const value: unknown = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      const method = value as (...args: unknown[]) => unknown
      return method.bind(target)
    },
  })
}

describe('publish and rollback', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    const objects = await env.FILES.list({ prefix: 'backups/' })
    for (const o of objects.objects) await env.FILES.delete(o.key)
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
          sha256: stateId === 'MT' ? 'a'.repeat(64) : 'b'.repeat(64),
          r2Key: `sources/${stateId}`,
          byteSize: 10,
          uploadedBy: ADMIN,
        })
        .returning()
      sourceIds[stateId] = doc?.id ?? 0
    }
    await db.insert(refCodes).values(
      ['F20', 'F200', 'F310', 'F329', 'F339', 'F1020'].map((codeNorm) => ({
        codeSystem: 'icd10cm' as const,
        codeNorm,
        description: 'x',
        validFrom: '2026-10-01',
        billable: 1,
      })),
    )
  })

  it('publishes a first version: status, state pointer, data version and audit', async () => {
    const id = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    const res = await publishAll(id, 'MT')
    expect(res.status).toBe(200)
    expect(publishResponseSchema.parse(await res.json())).toEqual({ ok: true, backupKey: null })

    expect(await statusOf(id)).toBe('published')
    const [mt] = await db.select().from(states).where(eq(states.id, 'MT'))
    expect(mt).toMatchObject({ publishedVersionId: id, status: 'published' })
    const [version] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, id))
    expect(version).toMatchObject({ publishedBy: ADMIN })
    expect(version?.publishedAt).toBeTruthy()
    expect(version?.contentUpdatedAt).toBe(version?.publishedAt)
    expect((await publishedEntries(db, 'MT')).map((e) => e.codeNorm)).toEqual(['F200', 'F310'])
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    expect(meta?.value).toBe('1')

    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'version.publish',
      target: `version:${String(id)}`,
    })
  })

  it('stores an auto mapping for each new category, and keeps confirmed ones', async () => {
    await db.insert(categoryMappings).values({
      stateId: 'MT',
      stateCategory: 'SUD',
      federalCategory: 'state_specific',
      method: 'manual',
      mappedBy: ADMIN,
    })
    const id = await draftWith('MT', [
      entry('F20.0'),
      entry('F10.20', { stateCategory: 'SUD' }),
      entry('F31.0', { stateCategory: 'Something else' }),
    ])
    expect((await publishAll(id, 'MT')).status).toBe(200)
    const rows = await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, 'MT'))
    expect(
      rows
        .map((m) => [m.stateCategory, m.federalCategory, m.method, m.confidence])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['SMI', 'disabling_mental_disorder', 'auto', 0.9],
      ['SUD', 'state_specific', 'manual', null],
    ])
  })

  it('needs every confirmation the checks ask for', async () => {
    const flagged = entry('F20', {
      codeNorm: 'F20',
      includesChildren: null,
      attributes: { included: true, flags: ['category_scope'] },
    })
    const id = await draftWith('MT', [entry('F20.0'), flagged])
    const { token } = await checksOf(id)
    const res = await send('POST', `/api/admin/drafts/${String(id)}/publish`, {
      token,
      confirmations: {},
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ missing: ['unresolved_flags'] })
    expect(await statusOf(id)).toBe('draft')
    expect((await publishAll(id, 'MT')).status).toBe(200)
  })

  it('refuses a publish over a typed check without the state code typed (required test)', async () => {
    const first = await draftWith('MT', [
      entry('F20.0'),
      entry('F31.0'),
      entry('F32.9'),
      entry('F33.9'),
    ])
    expect((await publishAll(first, 'MT')).status).toBe(200)
    // Three of four codes gone: "large change" needs the state code typed.
    const id = await draftWith('MT', [entry('F20.0')])
    const { report, token } = await checksOf(id)
    expect(report.checks.find((c) => c.id === 'large_change')?.triggered).toBe(true)
    const others = { same_source: {}, category_missing: {} }

    for (const typed of [undefined, 'NE', '']) {
      const res = await send('POST', `/api/admin/drafts/${String(id)}/publish`, {
        token,
        confirmations: { ...others, large_change: typed === undefined ? {} : { typed } },
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ missing: ['large_change'] })
    }
    expect(await statusOf(id)).toBe('draft')
    expect((await publishedEntries(db, 'MT')).map((e) => e.codeNorm)).toEqual([
      'F200',
      'F310',
      'F329',
      'F339',
    ])

    const res = await send('POST', `/api/admin/drafts/${String(id)}/publish`, {
      token,
      confirmations: { ...others, large_change: { typed: ' mt ' } },
    })
    expect(res.status).toBe(200)
  })

  it('refuses rows that changed after the checks ran', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    const { token } = await checksOf(id)
    const path = `/api/admin/drafts/${String(id)}`
    await send('PUT', `${path}/sources/${String(sourceIds['MT'] ?? 0)}`, {
      part: 'Table 1',
      expectedEntries: 1,
      invalidRowCount: 0,
      namedStateIds: [],
    })
    await send('POST', `${path}/rows`, {
      sourceDocumentId: sourceIds['MT'],
      part: 'Table 1',
      entries: [entry('F31.0')],
    })
    const res = await send('POST', `${path}/publish`, { token, confirmations: {} })
    expect(res.status).toBe(409)
    expect(await statusOf(id)).toBe('draft')
  })

  it('refuses a draft that a check blocks', async () => {
    const id = await draftWith('MT', [])
    const res = await publishAll(id, 'MT')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ missing: ['empty'] })
  })

  it('only publishes drafts', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    expect((await publishAll(id, 'MT')).status).toBe(200)
    expect((await publishAll(id, 'MT')).status).toBe(409)
  })

  it('lets only one of two racing publishes of a draft through (double submit)', async () => {
    const previous = await draftWith('MT', [entry('F20.0')])
    expect((await publishAll(previous, 'MT')).status).toBe(200)
    const id = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    const { report, token } = await checksOf(id)
    const confirmations = Object.fromEntries(
      report.checks
        .filter((c) => c.triggered && (c.level === 'confirm' || c.level === 'confirm_typed'))
        .map((c) => [c.id, c.level === 'confirm_typed' ? { typed: 'MT' } : {}]),
    )
    // Both requests pass the draft check before either batch runs; the second batch runs
    // after the first has committed.
    const DB = racingBatches(env.DB)
    const publish = async () =>
      call(`/api/admin/drafts/${String(id)}/publish`, {
        token: await accessToken(),
        method: 'POST',
        body: { token, confirmations },
        vars: { DB },
      })
    const responses = await Promise.all([publish(), publish()])
    const codes = responses.map((r) => r.status).sort()
    expect(codes).toEqual([200, 409])
    const loser = responses.find((r) => r.status === 409)
    expect(await loser?.json()).toEqual({
      error:
        'This version is no longer a draft: it was already published or discarded. Reload the page.',
    })

    const versions = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.stateId, 'MT'))
      .orderBy(datasetVersions.id)
    expect(versions.map((v) => [v.id, v.status])).toEqual([
      [previous, 'superseded'],
      [id, 'published'],
    ])
    const [mt] = await db.select().from(states).where(eq(states.id, 'MT'))
    expect(mt?.publishedVersionId).toBe(id)
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(
      audit.items.filter(
        (a) => a.action === 'version.publish' && a.target === `version:${String(id)}`,
      ),
    ).toHaveLength(1)
  })

  it('merges duplicates on publish, keeping the first', async () => {
    const id = await draftWith('MT', [
      entry('F20.0'),
      entry('F20.0', { sourceLocator: 'row 9' }),
      entry('F20.0', { tier: 'Tier 2' }),
    ])
    expect((await publishAll(id, 'MT')).status).toBe(200)
    const rows = await publishedEntries(db, 'MT')
    expect(rows.map((e) => [e.sourceLocator, e.tier])).toEqual([
      ['row F20.0', null],
      ['row F20.0', 'Tier 2'],
    ])
    const [version] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, id))
    expect(version?.rowCount).toBe(2)
  })

  it('backs up the replaced version to R2 first', async () => {
    const first = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    await publishAll(first, 'MT')
    const second = await draftWith('MT', [entry('F20.0'), entry('F31.0'), entry('F32.9')])
    const res = await publishAll(second, 'MT')
    const { backupKey } = publishResponseSchema.parse(await res.json())
    expect(backupKey).toBe(`backups/MT/${String(first)}.json`)
    const object = await env.FILES.get(backupKey ?? '')
    const backup: { version: { id: number }; entries: unknown[] } | undefined = await object?.json()
    if (!backup) throw new Error('no backup')
    expect(backup.version.id).toBe(first)
    expect(backup.entries).toHaveLength(2)
    expect(await statusOf(first)).toBe('superseded')
  })

  it('never changes another state when one is published (required test)', async () => {
    const ne = await draftWith('NE', [entry('F20.0'), entry('F31.0')])
    await publishAll(ne, 'NE')
    await draftWith('NE', [entry('F32.9')]) // an open NE draft
    await db.insert(categoryMappings).values({
      stateId: 'NE',
      stateCategory: 'Chapter 5',
      federalCategory: 'disabling_mental_disorder',
      method: 'manual',
      mappedBy: ADMIN,
    })
    const before = await snapshotState('NE')

    const first = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    await publishAll(first, 'MT')
    const second = await draftWith('MT', [entry('F20.0'), entry('F32.9')])
    await publishAll(second, 'MT')
    await send('POST', '/api/admin/states/MT/rollback', { versionId: first })

    expect(await snapshotState('NE')).toEqual(before)
  })

  it('rolls back to the exact previous public results (required test)', async () => {
    const first = await draftWith('MT', [
      entry('F20.0'),
      entry('F31.0', { qualification: 'needs_support', tier: 'Tier 2' }),
    ])
    await publishAll(first, 'MT')
    const published = await publishedEntries(db, 'MT')
    const second = await draftWith('MT', [entry('F32.9')])
    await publishAll(second, 'MT')
    expect(await publishedEntries(db, 'MT')).not.toEqual(published)

    const res = await send('POST', '/api/admin/states/MT/rollback', { versionId: first })
    expect(res.status).toBe(200)
    expect(await publishedEntries(db, 'MT')).toEqual(published)
    expect([await statusOf(first), await statusOf(second)]).toEqual(['published', 'superseded'])

    const versions = versionListResponseSchema.parse(
      await (await send('GET', '/api/admin/states/MT/versions')).json(),
    )
    expect(versions.items.map((v) => [v.versionNo, v.status])).toEqual([
      [2, 'superseded'],
      [1, 'published'],
    ])
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'version.rollback',
      target: `version:${String(first)}`,
    })
  })

  it('rolls back only to a superseded version of the same state', async () => {
    const mt = await draftWith('MT', [entry('F20.0')])
    await publishAll(mt, 'MT')
    const ne = await draftWith('NE', [entry('F20.0')])
    await publishAll(ne, 'NE')
    const draft = await draftWith('MT', [entry('F31.0')])

    const rollback = (versionId: number) =>
      send('POST', '/api/admin/states/MT/rollback', { versionId })
    expect((await rollback(ne)).status).toBe(404)
    expect((await rollback(draft)).status).toBe(409)
    expect((await rollback(mt)).status).toBe(409) // already published
    expect((await send('POST', '/api/admin/states/MT/rollback', { versionId: 'x' })).status).toBe(
      400,
    )
    expect(await statusOf(mt)).toBe('published')
  })
  it('keeps a publish whose coverage recompute fails, and says so with a warning', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await publishAll(id, 'MT', { DB: failingD1(env.DB, /entry_unified/) })
    logged.mockRestore()
    expect(res.status).toBe(200)
    const body = publishResponseSchema.parse(await res.json())
    expect(body.warning).toMatch(
      /^Saved\. Coverage could not be updated; press Rebuild coverage on Admin → Unified categories\. If that fails too, report it with reference [0-9a-f]{8}\.$/,
    )
    expect(await statusOf(id)).toBe('published')
    // Without the failure, there is no warning.
    const next = await draftWith('MT', [entry('F31.0')])
    expect(await (await publishAll(next, 'MT')).json()).not.toHaveProperty('warning')
  })

  it('keeps a rollback whose coverage recompute fails, and says so with a warning', async () => {
    const first = await draftWith('MT', [entry('F20.0')])
    await publishAll(first, 'MT')
    await publishAll(await draftWith('MT', [entry('F31.0')]), 'MT')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await send(
      'POST',
      '/api/admin/states/MT/rollback',
      { versionId: first },
      { DB: failingD1(env.DB, /entry_unified/) },
    )
    logged.mockRestore()
    expect(res.status).toBe(200)
    expect(rollbackResponseSchema.parse(await res.json()).warning).toMatch(/^Saved\./)
    expect(await statusOf(first)).toBe('published')
  })
})
