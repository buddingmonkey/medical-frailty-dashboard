import {
  idParamSchema,
  nextRepeatDate,
  type WatchCreate,
  type WatchItem,
  watchCreateSchema,
  watchItemSchema,
  watchLinkSchema,
  watchListQuerySchema,
  watchListResponseSchema,
  watchUpdateSchema,
} from '@mfcd/shared'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { states, watchItems } from '../../db/schema'
import type { AppEnv } from '../../types'

type Row = typeof watchItems.$inferSelect

const storedLinks = watchLinkSchema.array()

function toItem(row: Row): WatchItem {
  return watchItemSchema.parse({
    ...row,
    dateIsApproximate: row.dateIsApproximate === 1,
    links: row.linksJson === null ? [] : storedLinks.parse(JSON.parse(row.linksJson)),
  })
}

/** Columns written by create and edit. */
function columns(fields: WatchCreate) {
  return {
    title: fields.title,
    kind: fields.kind,
    stateId: fields.stateId,
    dueDate: fields.dueDate,
    dateIsApproximate: fields.dateIsApproximate ? 1 : 0,
    whyMd: fields.whyMd,
    linksJson: fields.links.length === 0 ? null : JSON.stringify(fields.links),
    repeatDays: fields.repeatDays,
  }
}

async function stateExists(db: Db, stateId: string | null): Promise<boolean> {
  if (stateId === null) return true
  const [row] = await db.select({ id: states.id }).from(states).where(eq(states.id, stateId))
  return row !== undefined
}

/** Today's date in UTC, `YYYY-MM-DD`. */
const todayUtc = () => new Date().toISOString().slice(0, 10)

// Mounted behind requireAdmin, so `identity.email` is always set.
export const watch = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = watchListQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid query' }, 400)
    const open = query.data.status === 'open'

    const rows = await createDb(c.env.DB)
      .select()
      .from(watchItems)
      .where(open ? eq(watchItems.status, 'open') : ne(watchItems.status, 'open'))
      .orderBy(
        ...(open
          ? [sql`${watchItems.dueDate} IS NULL`, asc(watchItems.dueDate), asc(watchItems.id)]
          : [sql`${watchItems.resolvedAt} DESC`, sql`${watchItems.id} DESC`]),
      )
    return c.json(watchListResponseSchema.parse({ items: rows.map(toItem) }))
  })

  .post('/', async (c) => {
    const body = watchCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid item' }, 400)
    const db = createDb(c.env.DB)
    if (!(await stateExists(db, body.data.stateId))) return c.json({ error: 'Unknown state' }, 400)
    const actor = c.var.identity?.email ?? ''

    const [row] = await db
      .insert(watchItems)
      .values({ ...columns(body.data), createdBy: actor })
      .returning()
    if (!row) throw new Error('watch item insert returned no row')
    await auditInsert(db, {
      actorEmail: actor,
      action: 'watch.create',
      target: `watch:${String(row.id)}`,
      details: { title: row.title, dueDate: row.dueDate },
    })
    return c.json(toItem(row), 201)
  })

  .put('/:id', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'))
    const body = watchUpdateSchema.safeParse(await c.req.json().catch(() => null))
    if (!id.success || !body.success) return c.json({ error: 'Invalid item' }, 400)
    const db = createDb(c.env.DB)
    const actor = c.var.identity?.email ?? ''
    const target = `watch:${String(id.data)}`

    const [current] = await db.select().from(watchItems).where(eq(watchItems.id, id.data))
    if (!current) return c.json({ error: 'Not found' }, 404)
    if (current.status !== 'open') return c.json({ error: 'Item is already closed' }, 409)
    const isOpen = and(eq(watchItems.id, id.data), eq(watchItems.status, 'open'))

    if (body.data.action === 'edit') {
      const fields = body.data
      if (!(await stateExists(db, fields.stateId))) return c.json({ error: 'Unknown state' }, 400)
      const [updated] = await db.batch([
        db.update(watchItems).set(columns(fields)).where(isOpen).returning(),
        auditInsert(db, { actorEmail: actor, action: 'watch.edit', target }),
      ])
      const [row] = updated
      if (!row) return c.json({ error: 'Item is already closed' }, 409)
      return c.json(toItem(row))
    }

    // Close. The close, its audit row and (for repeating items) the next item are one batch.
    const { status, resolutionMd } = body.data
    const closedOn = todayUtc()
    const nextDueDate =
      current.repeatDays === null
        ? null
        : nextRepeatDate(current.dueDate, closedOn, current.repeatDays)
    const close = db
      .update(watchItems)
      .set({ status, resolutionMd, resolvedBy: actor, resolvedAt: new Date().toISOString() })
      .where(isOpen)
      .returning()
    const audit = auditInsert(db, {
      actorEmail: actor,
      action: 'watch.close',
      target,
      details: { status, resolution: resolutionMd, nextDueDate },
    })
    const [closed] =
      nextDueDate === null
        ? await db.batch([close, audit])
        : await db.batch([
            close,
            audit,
            db.insert(watchItems).values({
              title: current.title,
              kind: current.kind,
              stateId: current.stateId,
              dueDate: nextDueDate,
              dateIsApproximate: 0,
              whyMd: current.whyMd,
              linksJson: current.linksJson,
              repeatDays: current.repeatDays,
              createdBy: actor,
            }),
          ])
    const [row] = closed
    if (!row) return c.json({ error: 'Item is already closed' }, 409)
    return c.json(toItem(row))
  })
