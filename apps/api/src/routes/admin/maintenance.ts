import {
  LAST_MAINTENANCE_KEY,
  maintenanceRunSchema,
  maintenanceStatusSchema,
  WEEKLY_DUMP_PREFIX,
  weeklyDumpDateSchema,
} from '@mfcd/shared'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { appMeta } from '../../db/schema'
import { listWeeklyDumps, runMaintenance } from '../../maintenance/maintenance'
import type { AppEnv } from '../../types'

// Weekly maintenance from /admin/restore (docs/deployment.md, "Backups and restore"). Both are
// behind requireAdmin and adminWriteGuard (src/app.ts).

const actorOf = (c: Context<AppEnv>) => c.var.identity?.email ?? ''

/** Mounted at /api/admin/maintenance. */
export const maintenanceRoute = new Hono<AppEnv>()
  // The last run and the weekly dumps in R2.
  .get('/', async (c) => {
    const [row] = await createDb(c.env.DB)
      .select({ value: appMeta.value })
      .from(appMeta)
      .where(eq(appMeta.key, LAST_MAINTENANCE_KEY))
    const parsed = row ? maintenanceRunSchema.safeParse(JSON.parse(row.value)) : null
    return c.json(
      maintenanceStatusSchema.parse({
        last: parsed?.success ? parsed.data : null,
        weekly: await listWeeklyDumps(c.env.FILES),
      }),
    )
  })

  // "Run maintenance now": the cron's run, by hand (so preview can try it on any day).
  .post('/', async (c) => {
    const actor = actorOf(c)
    const db = createDb(c.env.DB)
    await auditInsert(db, { actorEmail: actor, action: 'maintenance.run', target: 'maintenance' })
    const run = await runMaintenance(c.env, { trigger: 'manual', actor })
    return c.json(run)
  })

/**
 * Mounted at /api/admin/backup/weekly. One weekly dump, streamed from R2. Unlike the live
 * download it holds each source's R2 key (restore path 3 needs them); admins only.
 */
export const weeklyBackupRoute = new Hono<AppEnv>().get('/:date', async (c) => {
  const date = weeklyDumpDateSchema.safeParse(c.req.param('date'))
  if (!date.success) return c.json({ error: 'Not found' }, 404)
  const object = await c.env.FILES.get(`${WEEKLY_DUMP_PREFIX}${date.data}.zip`)
  if (!object) return c.json({ error: 'Not found' }, 404)
  const env = c.env.ENVIRONMENT.toLowerCase().replaceAll(/[^a-z0-9-]/g, '') || 'unknown'
  await auditInsert(createDb(c.env.DB), {
    actorEmail: actorOf(c),
    action: 'backup.weekly.download',
    target: 'backup:weekly',
    details: { date: date.data, bytes: object.size },
  })
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(object.size),
      'Content-Disposition': `attachment; filename="frailty-backup-${env}-weekly-${date.data}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
})
