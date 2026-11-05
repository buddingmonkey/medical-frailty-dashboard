import {
  type ConditionGroupBody,
  conditionGroupBodySchema,
  conditionGroupListResponseSchema,
  conditionGroupSaveResponseSchema,
  conditionGroupSlugFromName,
  conditionGroupSlugSchema,
  type ConditionMember,
  conditionMemberText,
  codeSystemLabels,
  parseConditionMember,
} from '@mfcd/shared'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { chunk } from '../../db/d1-limits'
import { bumpDataVersion } from '../../db/meta'
import { conditionGroups, conditionMembers } from '../../db/schema'
import type { AppEnv } from '../../types'

// Condition groups for "like" codes (roadmap M6 step 4; docs/data-model.md, "Like codes").
// Mounted at /api/admin/condition-groups behind requireAdmin and adminWriteGuard. A save sends
// the whole group with its member list; the member rows are replaced, in one batch with the
// audit row and the data_version bump (public code pages read published groups).

/** Member rows per insert: 5 bound parameters each, under D1's 100. */
const MEMBERS_PER_INSERT = 19

const memberKey = (m: ConditionMember) => `${m.codeSystem} ${conditionMemberText(m)}`

/** Every member line parsed, without repeats; or the first line that cannot be read. */
function parseMembers(
  body: ConditionGroupBody,
): { ok: true; members: ConditionMember[] } | { ok: false; error: string } {
  const seen = new Map<string, ConditionMember>()
  for (const [i, input] of body.members.entries()) {
    const parsed = parseConditionMember(input)
    if (!parsed.ok) {
      return {
        ok: false,
        error: `Member ${String(i + 1)} (${codeSystemLabels[input.codeSystem]}): ${parsed.error}`,
      }
    }
    for (const m of parsed.members) seen.set(memberKey(m), m)
  }
  return { ok: true, members: [...seen.values()] }
}

async function slugTaken(db: Db, slug: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: conditionGroups.id })
    .from(conditionGroups)
    .where(
      exceptId === undefined
        ? eq(conditionGroups.slug, slug)
        : and(eq(conditionGroups.slug, slug), ne(conditionGroups.id, exceptId)),
    )
  return row !== undefined
}

const slugClash = (slug: string) => ({
  error: `The slug "${slug}" is already used by another condition group`,
})

/** A slug taken between the check and the write still answers 409. */
const isSlugConflict = (error: unknown) =>
  error instanceof Error &&
  `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`.includes(
    'UNIQUE constraint failed: condition_groups.slug',
  )

/** A group's id, or a subquery by slug for a row the same batch creates. */
function idOf(which: { id: number } | { slug: string }) {
  return 'id' in which
    ? sql<number>`${which.id}`
    : sql<number>`(SELECT ${conditionGroups.id} FROM ${conditionGroups} WHERE ${conditionGroups.slug} = ${which.slug})`
}

/** Replaces a group's members (by id, or by slug for a row the batch creates). */
function replaceMembers(
  db: Db,
  which: { id: number } | { slug: string },
  members: ConditionMember[],
) {
  const groupId = idOf(which)
  const inserts = chunk(members, MEMBERS_PER_INSERT).map((part) =>
    db.insert(conditionMembers).values(part.map((m) => ({ ...m, groupId }))),
  )
  return [
    ...('id' in which
      ? [db.delete(conditionMembers).where(eq(conditionMembers.groupId, which.id))]
      : []),
    ...inserts,
  ]
}

async function readBody(c: { req: { json: () => Promise<unknown> } }) {
  const parsed = conditionGroupBodySchema.safeParse(await c.req.json().catch(() => null))
  return parsed.success ? parsed.data : null
}

export const conditionGroupsRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const [groups, members] = await db.batch([
      db.select().from(conditionGroups).orderBy(asc(conditionGroups.name)),
      db
        .select()
        .from(conditionMembers)
        .orderBy(
          asc(conditionMembers.codeSystem),
          asc(conditionMembers.codeNorm),
          asc(conditionMembers.id),
        ),
    ])
    return c.json(
      conditionGroupListResponseSchema.parse({
        items: groups.map((g) => ({
          ...g,
          members: members
            .filter((m) => m.groupId === g.id)
            .map((m) => ({ ...m, text: conditionMemberText(m) })),
        })),
      }),
    )
  })

  .post('/', async (c) => {
    const db = createDb(c.env.DB)
    const body = await readBody(c)
    if (!body) return c.json({ error: 'Invalid condition group' }, 400)
    const slug = body.slug ?? conditionGroupSlugFromName(body.name)
    if (!conditionGroupSlugSchema.safeParse(slug).success) {
      return c.json({ error: 'The name needs letters or digits for its slug' }, 400)
    }
    const parsed = parseMembers(body)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    if (await slugTaken(db, slug)) return c.json(slugClash(slug), 409)

    const actor = c.var.identity?.email ?? ''
    const write = db.batch([
      db
        .insert(conditionGroups)
        .values({
          slug,
          name: body.name,
          definition: body.definition,
          sources: body.sources,
          status: body.status,
          updatedBy: actor,
        })
        .returning({ id: conditionGroups.id }),
      ...replaceMembers(db, { slug }, parsed.members),
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actor,
        action: 'condition_group.create',
        target: `condition_group:${slug}`,
        details: { status: body.status, members: parsed.members.length },
      }),
    ])
    const result = await write.catch((error: unknown) => {
      if (isSlugConflict(error)) return null
      throw error
    })
    if (!result) return c.json(slugClash(slug), 409)
    const id = result[0][0]?.id ?? 0
    return c.json(
      conditionGroupSaveResponseSchema.parse({ id, slug, members: parsed.members.length }),
      201,
    )
  })

  .put('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Not found' }, 404)
    const [current] = await db.select().from(conditionGroups).where(eq(conditionGroups.id, id))
    if (!current) return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    if (!body) return c.json({ error: 'Invalid condition group' }, 400)
    const slug = body.slug ?? current.slug
    const parsed = parseMembers(body)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    if (await slugTaken(db, slug, id)) return c.json(slugClash(slug), 409)

    const before = await db
      .select()
      .from(conditionMembers)
      .where(eq(conditionMembers.groupId, id))
      .orderBy(asc(conditionMembers.codeSystem), asc(conditionMembers.codeNorm))
    const beforeKeys = before.map(memberKey)
    const afterKeys = parsed.members.map(memberKey)
    const added = afterKeys.filter((k) => !beforeKeys.includes(k))
    const removed = beforeKeys.filter((k) => !afterKeys.includes(k))
    /** [before, after] when a field changed; left out of the audit row otherwise. */
    const diff = (a: string, b: string) => (a === b ? undefined : [a, b])

    const actor = c.var.identity?.email ?? ''
    const write = db.batch([
      db
        .update(conditionGroups)
        .set({
          slug,
          name: body.name,
          definition: body.definition,
          sources: body.sources,
          status: body.status,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(conditionGroups.id, id)),
      ...(added.length > 0 || removed.length > 0 ? replaceMembers(db, { id }, parsed.members) : []),
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actor,
        action: 'condition_group.update',
        target: `condition_group:${slug}`,
        details: {
          id,
          name: diff(current.name, body.name),
          slug: diff(current.slug, slug),
          status: diff(current.status, body.status),
          ...(added.length > 0 ? { added } : {}),
          ...(removed.length > 0 ? { removed } : {}),
        },
      }),
    ])
    const result = await write.catch((error: unknown) => {
      if (isSlugConflict(error)) return null
      throw error
    })
    if (!result) return c.json(slugClash(slug), 409)
    return c.json(
      conditionGroupSaveResponseSchema.parse({ id, slug, members: parsed.members.length }),
    )
  })
