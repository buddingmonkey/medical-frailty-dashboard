import { LAST_MAINTENANCE_KEY, maintenanceRunSchema, maintenanceStatusSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, auditLog, states } from '../../db/schema'
import { accessToken, ADMIN, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// Maintenance from the admin pages (docs/deployment.md, "Backups and restore").

const db = createDb(env.DB)

async function clearBucket() {
  for (;;) {
    const listed = await env.FILES.list({ limit: 1000 })
    if (listed.objects.length === 0) return
    await env.FILES.delete(listed.objects.map((o) => o.key))
  }
}

async function audits(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

const guest = () => accessToken({ email: 'guest@example.org' })

beforeEach(async () => {
  await resetDb(env.DB)
  await clearBucket()
  await db.insert(states).values({ id: 'MT', slug: 'mt', name: 'Montana', fips: '30' })
})

describe('GET /api/admin/maintenance', () => {
  it('shows no run yet and lists the weekly dumps, newest first', async () => {
    await env.FILES.put('backups/weekly/2026-10-25.zip', 'aa')
    await env.FILES.put('backups/weekly/2026-11-01.zip', 'bbbb')
    await env.FILES.put('backups/weekly/notes.txt', 'x')
    const res = await call('/api/admin/maintenance', { token: await accessToken() })
    expect(res.status).toBe(200)
    const body = maintenanceStatusSchema.parse(await res.json())
    expect(body.last).toBeNull()
    expect(body.weekly.map((w) => [w.date, w.size])).toEqual([
      ['2026-11-01', 4],
      ['2026-10-25', 2],
    ])
  })

  it('shows no run when last_maintenance is not valid JSON or not a run', async () => {
    for (const value of ['{not json', '{"startedAt":1}']) {
      await db
        .insert(appMeta)
        .values({ key: LAST_MAINTENANCE_KEY, value })
        .onConflictDoUpdate({ target: appMeta.key, set: { value } })
      const res = await call('/api/admin/maintenance', { token: await accessToken() })
      expect(res.status).toBe(200)
      expect(maintenanceStatusSchema.parse(await res.json()).last).toBeNull()
    }
  })

  it('is admin-only', async () => {
    expect((await call('/api/admin/maintenance')).status).toBe(401)
    expect((await call('/api/admin/maintenance', { token: await guest() })).status).toBe(403)
  })
})

describe('POST /api/admin/maintenance', () => {
  it('runs maintenance now, audited, and the status shows the run', async () => {
    const res = await call('/api/admin/maintenance', {
      token: await accessToken(),
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
    const run = maintenanceRunSchema.parse(await res.json())
    expect(run.trigger).toBe('manual')
    expect(run.parts.weeklyDump.status).toBe('ok')
    const [audit] = await audits('maintenance.run')
    expect(audit).toMatchObject({ actorEmail: ADMIN, target: 'maintenance' })

    const status = maintenanceStatusSchema.parse(
      await (await call('/api/admin/maintenance', { token: await accessToken() })).json(),
    )
    expect(status.last).toEqual(run)
    expect(status.weekly).toHaveLength(1)
  })

  it('is admin-only and refuses a cross-origin write', async () => {
    const post = { method: 'POST', body: {} }
    expect((await call('/api/admin/maintenance', post)).status).toBe(401)
    expect((await call('/api/admin/maintenance', { ...post, token: await guest() })).status).toBe(
      403,
    )
    const res = await call('/api/admin/maintenance', {
      ...post,
      token: await accessToken(),
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
    expect(await audits('maintenance.run')).toHaveLength(0)
    expect((await env.FILES.list({ prefix: 'backups/weekly/' })).objects).toHaveLength(0)
  })
})

describe('GET /api/admin/backup/weekly/:date', () => {
  it('streams the dump as an attachment, audited', async () => {
    await env.FILES.put('backups/weekly/2026-11-01.zip', new Uint8Array([80, 75, 3, 4]))
    const res = await call('/api/admin/backup/weekly/2026-11-01', { token: await accessToken() })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="frailty-backup-test-weekly-2026-11-01.zip"',
    )
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([80, 75, 3, 4])
    expect(await audits('backup.weekly.download')).toHaveLength(1)
  })

  it.each(['2026-02-30', '2026-11-1', '..%2F..%2Fsources', '2026-11-01.zip', 'latest'])(
    'refuses the date %s',
    async (date) => {
      const res = await call(`/api/admin/backup/weekly/${date}`, { token: await accessToken() })
      expect(res.status).toBe(404)
    },
  )

  it('answers 404 for a date with no dump', async () => {
    const res = await call('/api/admin/backup/weekly/2026-11-01', { token: await accessToken() })
    expect(res.status).toBe(404)
  })

  it('is admin-only', async () => {
    await env.FILES.put('backups/weekly/2026-11-01.zip', 'zip')
    expect((await call('/api/admin/backup/weekly/2026-11-01')).status).toBe(401)
    const res = await call('/api/admin/backup/weekly/2026-11-01', { token: await guest() })
    expect(res.status).toBe(403)
  })
})
