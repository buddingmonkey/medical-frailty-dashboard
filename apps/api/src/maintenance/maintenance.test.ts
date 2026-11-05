import {
  fullBackupSchema,
  KEEP_MANUAL_DUMPS,
  KEEP_PUBLISH_BACKUPS,
  KEEP_WEEKLY_DUMPS,
  LAST_MAINTENANCE_KEY,
  maintenanceRunSchema,
} from '@mfcd/shared'
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../db/client'
import {
  appMeta,
  auditLog,
  datasetVersions,
  draftParts,
  entries,
  sourceDocuments,
  states,
  versionSources,
} from '../db/schema'
import worker from '../index'
import { ADMIN } from '../test/access-fixtures'
import { draftWith, entry, publishAll, send, sourceIds } from '../test/draft-fixtures'
import { resetDb } from '../test/reset-db'
import {
  cleanupDrafts,
  listWeeklyDumps,
  prunePublishBackups,
  pruneWeeklyDumps,
  runMaintenance,
  writeWeeklyDump,
} from './maintenance'

// Weekly maintenance (docs/deployment.md, "Backups and restore"; docs/data-model.md, step 6).

const db = createDb(env.DB)
const NOW = new Date('2026-11-08T07:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const ACTOR = 'maintenance (cron)'
const encoder = new TextEncoder()

async function clearBucket() {
  for (;;) {
    const listed = await env.FILES.list({ limit: 1000 })
    if (listed.objects.length === 0) return
    await env.FILES.delete(listed.objects.map((o) => o.key))
  }
}

async function keys(prefix: string) {
  const listed = await env.FILES.list({ prefix, limit: 1000 })
  return listed.objects.map((o) => o.key).sort()
}

async function audits(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

/** Moves a version's activity (and creation) back in time. */
async function age(versionId: number, days: number, created = days) {
  await db
    .update(datasetVersions)
    .set({ updatedAt: daysAgo(days), createdAt: daysAgo(created) })
    .where(eq(datasetVersions.id, versionId))
}

async function version(id: number) {
  const [row] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, id))
  return row
}

async function countOf(
  table: typeof entries | typeof draftParts | typeof versionSources,
  id: number,
) {
  return (await db.select().from(table).where(eq(table.versionId, id))).length
}

async function addSource(stateId: string, name: string) {
  const r2Key = `sources/${stateId}/${name}`
  await env.FILES.put(r2Key, 'file')
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      stateId,
      title: name,
      fileType: 'pdf',
      sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(name)))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      r2Key,
      byteSize: 4,
      uploadedBy: ADMIN,
    })
    .returning()
  return { id: doc?.id ?? 0, r2Key }
}

beforeEach(async () => {
  await resetDb(env.DB)
  await clearBucket()
  await db.insert(states).values([
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  for (const stateId of ['MT', 'NE']) {
    sourceIds[stateId] = (await addSource(stateId, `${stateId}-list`)).id
  }
})

describe('cleanupDrafts', () => {
  it('deletes an open draft idle for 31 days and keeps one idle for 29', async () => {
    const old = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    const recent = await draftWith('MT', [entry('F20.0')])
    await age(old, 31)
    await age(recent, 29)

    const counts = await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)

    expect(counts).toMatchObject({ draftsDeleted: 1, discardedEmptied: 0, entriesDeleted: 2 })
    expect(await version(old)).toBeUndefined()
    for (const table of [entries, draftParts, versionSources]) {
      expect(await countOf(table, old)).toBe(0)
    }
    expect(await version(recent)).toMatchObject({ status: 'draft' })
    expect(await countOf(entries, recent)).toBe(1)

    const [audit, ...more] = await audits('draft.expire')
    expect(more).toHaveLength(0)
    expect(audit).toMatchObject({ actorEmail: ACTOR, target: `version:${String(old)}` })
    expect(JSON.parse(audit?.detailsJson ?? '{}')).toEqual({
      stateId: 'MT',
      versionNo: 1,
      entries: 2,
      outcome: 'deleted',
    })
  })

  it('counts recent activity, not the created time', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    await age(id, 2, 90)
    await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)
    expect(await version(id)).toMatchObject({ status: 'draft' })
  })

  it('falls back to the created time when updated_at is empty (rows before migration 0015)', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    await db
      .update(datasetVersions)
      .set({ updatedAt: null, createdAt: daysAgo(40) })
      .where(eq(datasetVersions.id, id))
    await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)
    expect(await version(id)).toBeUndefined()
  })

  it('empties a discarded draft older than 30 days but keeps its row', async () => {
    const id = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    expect((await send('POST', `/api/admin/drafts/${String(id)}/discard`, {})).status).toBe(200)
    await age(id, 31)

    const counts = await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)

    expect(counts).toMatchObject({ draftsDeleted: 0, discardedEmptied: 1, entriesDeleted: 2 })
    expect(await version(id)).toMatchObject({ status: 'discarded', versionNo: 1 })
    expect(await countOf(entries, id)).toBe(0)
    expect(await countOf(draftParts, id)).toBe(0)
    // The record of what it cited stays, so its source stays too.
    expect(await countOf(versionSources, id)).toBe(1)
    const [audit] = await audits('draft.expire')
    expect(JSON.parse(audit?.detailsJson ?? '{}')).toMatchObject({ outcome: 'emptied', entries: 2 })

    // A second run finds nothing left to do: no second audit row.
    await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)
    expect(await audits('draft.expire')).toHaveLength(1)
  })

  it('keeps a discarded draft younger than 30 days whole', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    await send('POST', `/api/admin/drafts/${String(id)}/discard`, {})
    await age(id, 29)
    await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)
    expect(await countOf(entries, id)).toBe(1)
  })

  it('never touches published or superseded versions', async () => {
    const first = await draftWith('MT', [entry('F20.0')])
    expect((await publishAll(first, 'MT')).status).toBe(200)
    const second = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    expect((await publishAll(second, 'MT')).status).toBe(200)
    await age(first, 400)
    await age(second, 400)

    await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)

    expect(await version(first)).toMatchObject({ status: 'superseded' })
    expect(await version(second)).toMatchObject({ status: 'published' })
    expect(await countOf(entries, first)).toBe(1)
    expect(await countOf(entries, second)).toBe(2)
    expect(await audits('draft.expire')).toHaveLength(0)
  })

  it('deletes a source only the expired draft cited, and keeps a shared one', async () => {
    const shared = sourceIds['MT'] ?? 0
    const published = await draftWith('MT', [entry('F20.0')])
    expect((await publishAll(published, 'MT')).status).toBe(200)

    const own = await addSource('MT', 'only-in-draft')
    const draft = await draftWith('MT', [entry('F20.0')])
    const path = `/api/admin/drafts/${String(draft)}`
    await send('PUT', `${path}/sources/${String(own.id)}`, {
      part: 'Sheet1',
      expectedEntries: 1,
      invalidRowCount: 0,
      namedStateIds: [],
    })
    await send('POST', `${path}/rows`, {
      sourceDocumentId: own.id,
      part: 'Sheet1',
      entries: [entry('F32.9')],
    })
    expect(await countOf(versionSources, draft)).toBe(2)
    await age(draft, 31)

    const counts = await cleanupDrafts(env.DB, env.FILES, NOW, ACTOR)

    expect(counts).toMatchObject({ draftsDeleted: 1, sourcesDeleted: 1 })
    const left = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(inArray(sourceDocuments.id, [shared, own.id]))
    expect(left.map((s) => s.id)).toEqual([shared])
    expect(await env.FILES.head(own.r2Key)).toBeNull()
    expect(await env.FILES.head('sources/MT/MT-list')).not.toBeNull()
    expect(await audits('source.expire')).toHaveLength(1)
  })
})

describe('prunePublishBackups', () => {
  it(`keeps the newest ${String(KEEP_PUBLISH_BACKUPS)} per state`, async () => {
    for (let id = 1; id <= KEEP_PUBLISH_BACKUPS + 3; id++) {
      await env.FILES.put(`backups/MT/${String(id)}.json`, '{}')
    }
    for (const id of [100, 101, 102]) await env.FILES.put(`backups/NE/${String(id)}.json`, '{}')
    await env.FILES.put('backups/weekly/2026-11-01.zip', 'zip')

    const counts = await prunePublishBackups(db, env.FILES, ACTOR)

    expect(counts).toEqual({ deleted: 3, kept: KEEP_PUBLISH_BACKUPS + 3, states: 2 })
    const mt = await keys('backups/MT/')
    expect(mt).toHaveLength(KEEP_PUBLISH_BACKUPS)
    // Numeric order: 2 is older than 10.
    expect(mt).not.toContain('backups/MT/1.json')
    expect(mt).not.toContain('backups/MT/3.json')
    expect(mt).toContain('backups/MT/4.json')
    expect(mt).toContain('backups/MT/23.json')
    expect(await keys('backups/NE/')).toHaveLength(3)
    expect(await keys('backups/weekly/')).toHaveLength(1)
    const [audit, ...more] = await audits('backup.prune')
    expect(more).toHaveLength(0)
    expect(JSON.parse(audit?.detailsJson ?? '{}')).toMatchObject({ deleted: 3 })
  })
})

describe('weekly dumps', () => {
  it('writes the download’s zip to backups/weekly/<UTC date>.zip, with R2 keys', async () => {
    const id = await draftWith('MT', [entry('F20.0')])
    await publishAll(id, 'MT')

    const counts = await writeWeeklyDump(env, NOW)

    const object = await env.FILES.get('backups/weekly/2026-11-08.zip')
    if (!object) throw new Error('no weekly dump')
    expect(object.httpMetadata?.contentType).toBe('application/zip')
    const files = unzipSync(new Uint8Array(await object.arrayBuffer()))
    const [name, ...rest] = Object.keys(files)
    expect(rest).toHaveLength(0)
    expect(name).toBe('frailty-backup-test-20261108T070000Z.json')
    const backup = fullBackupSchema.parse(
      JSON.parse(new TextDecoder().decode(files[name ?? ''] ?? new Uint8Array())),
    )
    // Unlike the download, the weekly dump stays in R2 and keeps each source's key.
    expect(backup.tables.source_documents[0]).toMatchObject({ r2Key: 'sources/MT/MT-list' })
    expect(counts['zipBytes']).toBe(object.size)
    expect(counts['rows']).toBeGreaterThan(0)
  })

  it(`keeps the newest ${String(KEEP_WEEKLY_DUMPS)} weekly dumps`, async () => {
    const dates = Array.from({ length: KEEP_WEEKLY_DUMPS + 2 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 2 + 7 * i)).toISOString().slice(0, 10),
    )
    for (const date of dates) await env.FILES.put(`backups/weekly/${date}.zip`, 'zip')
    await env.FILES.put('backups/MT/1.json', '{}')

    expect(await pruneWeeklyDumps(env.FILES)).toEqual({ deleted: 2, kept: KEEP_WEEKLY_DUMPS })
    const left = await keys('backups/weekly/')
    expect(left).toEqual(dates.slice(2).map((d) => `backups/weekly/${d}.zip`))
    expect(await keys('backups/MT/')).toHaveLength(1)
    expect((await listWeeklyDumps(env.FILES)).map((d) => d.date)).toEqual(dates.slice(2).reverse())
  })
})

describe('manual dumps', () => {
  const weekly = (i: number) => new Date(Date.UTC(2026, 7, 2 + 7 * i)).toISOString().slice(0, 10)
  const manual = (i: number) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10)

  it('tags a dump with what made it', async () => {
    await writeWeeklyDump(env, NOW, 'manual')
    const object = await env.FILES.head('backups/weekly/2026-11-08.zip')
    expect(object?.customMetadata?.['trigger']).toBe('manual')
    await env.FILES.delete('backups/weekly/2026-11-08.zip')
    await writeWeeklyDump(env, NOW)
    const cron = await env.FILES.head('backups/weekly/2026-11-08.zip')
    expect(cron?.customMetadata?.['trigger']).toBe('cron')
  })

  it('keeps the weekly tag when a manual run replaces that day’s weekly dump', async () => {
    await writeWeeklyDump(env, NOW, 'cron')
    await writeWeeklyDump(env, NOW, 'manual')
    const object = await env.FILES.head('backups/weekly/2026-11-08.zip')
    expect(object?.customMetadata?.['trigger']).toBe('cron')
  })

  it(`keeps ${String(KEEP_WEEKLY_DUMPS)} weekly dumps however many manual runs are newer`, async () => {
    const cron = Array.from({ length: KEEP_WEEKLY_DUMPS + 1 }, (_, i) => weekly(i))
    const byHand = Array.from({ length: KEEP_MANUAL_DUMPS + 2 }, (_, i) => manual(i))
    // Untagged dumps (written before the tag existed) count as weekly.
    await env.FILES.put(`backups/weekly/${cron[0] ?? ''}.zip`, 'zip')
    for (const date of cron.slice(1)) {
      await env.FILES.put(`backups/weekly/${date}.zip`, 'zip', {
        customMetadata: { trigger: 'cron' },
      })
    }
    for (const date of byHand) {
      await env.FILES.put(`backups/weekly/${date}.zip`, 'zip', {
        customMetadata: { trigger: 'manual' },
      })
    }

    expect(await pruneWeeklyDumps(env.FILES)).toEqual({
      deleted: 3,
      kept: KEEP_WEEKLY_DUMPS + KEEP_MANUAL_DUMPS,
    })
    expect(await keys('backups/weekly/')).toEqual(
      [...cron.slice(1), ...byHand.slice(2)].map((d) => `backups/weekly/${d}.zip`),
    )
  })
})

describe('runMaintenance', () => {
  it('runs every part and writes last_maintenance', async () => {
    const old = await draftWith('MT', [entry('F20.0')])
    await age(old, 31)

    const run = await runMaintenance(env, { trigger: 'manual', actor: ADMIN, now: NOW })

    expect(Object.values(run.parts).map((p) => p.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(run.parts.draftCleanup.counts).toMatchObject({ draftsDeleted: 1 })
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, LAST_MAINTENANCE_KEY))
    expect(maintenanceRunSchema.parse(JSON.parse(meta?.value ?? 'null'))).toEqual(run)
    // Counts only: no codes or descriptions in the stored result.
    expect(meta?.value).not.toContain('F20')
  })

  it('goes on with the other parts when one fails', async () => {
    const old = await draftWith('MT', [entry('F20.0')])
    await age(old, 31)
    const files = new Proxy(env.FILES, {
      get(target, prop) {
        if (prop === 'put') return () => Promise.reject(new Error('R2 is down'))
        const value: unknown = Reflect.get(target, prop)
        if (typeof value !== 'function') return value
        return (...args: unknown[]): unknown => Reflect.apply(value, target, args)
      },
    })

    const run = await runMaintenance(
      { ...env, FILES: files },
      { trigger: 'cron', actor: ACTOR, now: NOW },
    )

    expect(run.parts.weeklyDump).toMatchObject({ status: 'failed', error: 'R2 is down' })
    expect(run.parts.pruneWeeklyDumps.status).toBe('ok')
    expect(run.parts.prunePublishBackups.status).toBe('ok')
    expect(run.parts.draftCleanup).toMatchObject({ status: 'ok', counts: { draftsDeleted: 1 } })
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, LAST_MAINTENANCE_KEY))
    expect(JSON.parse(meta?.value ?? '{}')).toMatchObject({ trigger: 'cron' })
  })
})

describe('scheduled handler', () => {
  it('runs maintenance on the Cron Trigger', async () => {
    const controller = createScheduledController({
      cron: '0 7 * * SUN',
      scheduledTime: NOW.getTime(),
    })
    const ctx = createExecutionContext()
    worker.scheduled(controller, env, ctx)
    await waitOnExecutionContext(ctx)

    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, LAST_MAINTENANCE_KEY))
    const run = maintenanceRunSchema.parse(JSON.parse(meta?.value ?? 'null'))
    expect(run.trigger).toBe('cron')
    expect(run.parts.weeklyDump.status).toBe('ok')
    expect(await keys('backups/weekly/')).toEqual(['backups/weekly/2026-11-08.zip'])
  })
})
