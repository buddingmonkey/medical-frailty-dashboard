import {
  ccsrCategoryListResponseSchema,
  isReservedUnifiedSlug,
  type UnifiedCategoryBody,
  unifiedCategoryBodySchema,
  unifiedListResponseSchema,
  unifiedSaveResponseSchema,
  unifiedSlugFromLabel,
  unifiedSlugSchema,
  unifiedStatusChangeAllowed,
  unifiedVersionChanges,
} from '@mfcd/shared'
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { chunk } from '../../db/d1-limits'
import { bumpDataVersion } from '../../db/meta'
import { recomputePlacements, universeStatements } from '../../db/placement'
import { refCcsrCategories, unifiedCategories, unifiedCcsr, unifiedMappings } from '../../db/schema'
import { recomputeAfterSave } from '../../middleware/errors'
import type { AppEnv } from '../../types'
import { actorOf, idParam, notFound } from './request'

// Unified categories (roadmap M5 step 3; docs/data-model.md, "Unified categories (M5)").
// Mounted at /api/admin/unified behind requireAdmin and adminWriteGuard.

/** The CCSR groups in the body that `ref_ccsr_categories` does not have. */
async function unknownCcsr(db: Db, groups: readonly string[]): Promise<string[]> {
  if (groups.length === 0) return []
  // One bound parameter for the whole list (D1 binds at most 100).
  const known = await db
    .select({ id: refCcsrCategories.ccsrCategory })
    .from(refCcsrCategories)
    .where(
      sql`${refCcsrCategories.ccsrCategory} IN (SELECT value FROM json_each(${JSON.stringify(groups)}))`,
    )
  const found = new Set(known.map((k) => k.id))
  return groups.filter((g) => !found.has(g))
}

async function slugTaken(db: Db, slug: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: unifiedCategories.id })
    .from(unifiedCategories)
    .where(
      exceptId === undefined
        ? eq(unifiedCategories.slug, slug)
        : and(eq(unifiedCategories.slug, slug), ne(unifiedCategories.id, exceptId)),
    )
  return row !== undefined
}

const slugReserved = (slug: string) => ({
  error: `The slug "${slug}" is reserved for the site; choose another slug`,
})

const slugClash = (slug: string) => ({
  error: `The slug "${slug}" is already used by another unified category`,
})

/** CCSR rows per insert: 2 bound parameters each, under D1's 100. */
const CCSR_PER_INSERT = 45

/** A category's id, or a subquery by slug for a row the same batch creates. */
function idOf(which: { id: number } | { slug: string }) {
  return 'id' in which
    ? sql<number>`${which.id}`
    : sql<number>`(SELECT ${unifiedCategories.id} FROM ${unifiedCategories} WHERE ${unifiedCategories.slug} = ${which.slug})`
}

/**
 * Replaces a category's CCSR group set (by id, or by slug for a row the batch creates), and
 * rewrites its universe from the new set.
 */
function replaceCcsr(db: Db, which: { id: number } | { slug: string }, groups: string[]) {
  const unifiedId = idOf(which)
  const inserts = chunk(groups, CCSR_PER_INSERT).map((part) =>
    db.insert(unifiedCcsr).values(part.map((ccsrCategory) => ({ unifiedId, ccsrCategory }))),
  )
  return [
    ...('id' in which ? [db.delete(unifiedCcsr).where(eq(unifiedCcsr.unifiedId, which.id))] : []),
    ...inserts,
    ...universeStatements(db, unifiedId),
  ]
}

/** The body, with its CCSR groups sorted and without repeats; null when invalid. */
function parseBody(raw: unknown): UnifiedCategoryBody | null {
  const body = unifiedCategoryBodySchema.safeParse(raw)
  if (!body.success) return null
  return { ...body.data, ccsr: [...new Set(body.data.ccsr)].sort() }
}

/** A slug taken between the check and the write still answers 409. */
const isSlugConflict = (error: unknown) =>
  error instanceof Error &&
  `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`.includes(
    'UNIQUE constraint failed: unified_categories.slug',
  )

export const unifiedRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const [categories, groups, approved] = await db.batch([
      db
        .select()
        .from(unifiedCategories)
        .orderBy(
          asc(unifiedCategories.federalCategory),
          asc(unifiedCategories.sortOrder),
          asc(unifiedCategories.label),
        ),
      db
        .select({
          unifiedId: unifiedCcsr.unifiedId,
          ccsrCategory: unifiedCcsr.ccsrCategory,
          description: refCcsrCategories.description,
        })
        .from(unifiedCcsr)
        .leftJoin(refCcsrCategories, eq(refCcsrCategories.ccsrCategory, unifiedCcsr.ccsrCategory))
        .orderBy(asc(unifiedCcsr.ccsrCategory)),
      db
        .select({ unifiedId: unifiedMappings.unifiedId, n: count() })
        .from(unifiedMappings)
        .where(eq(unifiedMappings.status, 'approved'))
        .groupBy(unifiedMappings.unifiedId),
    ])
    const approvedBy = new Map(approved.map((a) => [a.unifiedId, a.n]))
    return c.json(
      unifiedListResponseSchema.parse({
        items: categories.map((u) => {
          const own = groups.filter((g) => g.unifiedId === u.id)
          return {
            ...u,
            ccsr: own.map((g) => g.ccsrCategory),
            ccsrGroups: own.map((g) => ({
              ccsrCategory: g.ccsrCategory,
              description: g.description,
            })),
            approvedMappings: approvedBy.get(u.id) ?? 0,
          }
        }),
      }),
    )
  })

  .post('/', async (c) => {
    const db = createDb(c.env.DB)
    const body = parseBody(await c.req.json().catch(() => null))
    if (!body) return c.json({ error: 'Invalid unified category' }, 400)
    const { ccsr, ...fields } = body
    if (fields.status === 'retired') {
      return c.json({ error: 'Save a new unified category as a draft or as published.' }, 400)
    }
    const slug = fields.slug ?? unifiedSlugFromLabel(fields.label)
    if (isReservedUnifiedSlug(slug)) return c.json(slugReserved(slug), 400)
    if (!unifiedSlugSchema.safeParse(slug).success) {
      return c.json({ error: 'The label needs letters or digits for its slug' }, 400)
    }
    const unknown = await unknownCcsr(db, ccsr)
    if (unknown.length > 0)
      return c.json({ error: `Unknown CCSR group: ${unknown.join(', ')}` }, 400)
    if (await slugTaken(db, slug)) return c.json(slugClash(slug), 409)

    const actor = actorOf(c)
    const now = new Date().toISOString()
    const write = db.batch([
      db
        .insert(unifiedCategories)
        .values({
          ...fields,
          slug,
          version: 1,
          createdBy: actor,
          createdAt: now,
          updatedBy: actor,
          updatedAt: now,
        })
        .returning({ id: unifiedCategories.id }),
      ...replaceCcsr(db, { slug }, ccsr),
      ...(fields.status === 'draft' ? [] : [bumpDataVersion(db)]),
      auditInsert(db, {
        actorEmail: actor,
        action: 'unified.create',
        target: `unified:${slug}`,
        details: { status: fields.status, ccsr },
      }),
    ])
    const result = await write.catch((error: unknown) => {
      if (isSlugConflict(error)) return null
      throw error
    })
    if (!result) return c.json(slugClash(slug), 409)
    const id = result[0][0]?.id ?? 0
    // A new published category takes entries by CCSR group in every state with a list.
    // The category stands if this fails: the answer carries a warning instead.
    const recomputed =
      fields.status === 'published' && ccsr.length > 0
        ? await recomputeAfterSave(c, () => recomputePlacements(db, 'all'))
        : {}
    return c.json(unifiedSaveResponseSchema.parse({ id, slug, version: 1, ...recomputed }), 201)
  })

  .put('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const id = idParam(c)
    if (id === null) return notFound(c)
    const [current] = await db.select().from(unifiedCategories).where(eq(unifiedCategories.id, id))
    if (!current) return notFound(c)
    const body = parseBody(await c.req.json().catch(() => null))
    if (!body) return c.json({ error: 'Invalid unified category' }, 400)
    const { ccsr, ...fields } = body
    if (!unifiedStatusChangeAllowed(current.status, fields.status)) {
      return c.json(
        {
          error: `A unified category cannot go from ${current.status} ${fields.status === 'draft' ? 'back to draft' : `to ${fields.status}`}`,
        },
        409,
      )
    }
    const slug = fields.slug ?? current.slug
    const unknown = await unknownCcsr(db, ccsr)
    if (unknown.length > 0)
      return c.json({ error: `Unknown CCSR group: ${unknown.join(', ')}` }, 400)
    if (await slugTaken(db, slug, id)) return c.json(slugClash(slug), 409)

    const before = await db
      .select({ ccsrCategory: unifiedCcsr.ccsrCategory })
      .from(unifiedCcsr)
      .where(eq(unifiedCcsr.unifiedId, id))
    const ccsrChanged =
      before
        .map((g) => g.ccsrCategory)
        .sort()
        .join(',') !== ccsr.join(',')
    const version = current.version + (unifiedVersionChanges(current, fields) ? 1 : 0)
    // Drafts are never public, and a draft retired unpublished never was; anything else can
    // change public pages.
    const isPublic = current.status !== 'draft' || fields.status === 'published'
    const actor = actorOf(c)
    const write = db.batch([
      db
        .update(unifiedCategories)
        .set({ ...fields, slug, version, updatedBy: actor, updatedAt: new Date().toISOString() })
        .where(eq(unifiedCategories.id, id)),
      ...(ccsrChanged ? replaceCcsr(db, { id }, ccsr) : []),
      // A status change also rebuilds the full code list (only the difference is written), so a
      // category seeded without one (migration 0011) gets it when it is published.
      ...(!ccsrChanged && current.status !== fields.status
        ? universeStatements(db, idOf({ id }))
        : []),
      ...(isPublic ? [bumpDataVersion(db)] : []),
      auditInsert(db, {
        actorEmail: actor,
        action: 'unified.update',
        target: `unified:${slug}`,
        details: {
          id,
          version,
          ...(current.status === fields.status ? {} : { status: [current.status, fields.status] }),
          ...(current.slug === slug ? {} : { slug: [current.slug, slug] }),
          ccsr,
        },
      }),
    ])
    const result = await write.catch((error: unknown) => {
      if (isSlugConflict(error)) return null
      throw error
    })
    if (!result) return c.json(slugClash(slug), 409)
    // Placements read the CCSR set and the status (published only), in every state.
    const recomputed =
      isPublic && (ccsrChanged || current.status !== fields.status)
        ? await recomputeAfterSave(c, () => recomputePlacements(db, 'all'))
        : {}
    return c.json(unifiedSaveResponseSchema.parse({ id, slug, version, ...recomputed }))
  })

/** Every CCSR category, for the picker. Mounted at /api/admin/ccsr-categories. */
export const ccsrCategoriesRoute = new Hono<AppEnv>().get('/', async (c) => {
  const items = await createDb(c.env.DB)
    .select({
      ccsrCategory: refCcsrCategories.ccsrCategory,
      description: refCcsrCategories.description,
      bodySystem: refCcsrCategories.bodySystem,
    })
    .from(refCcsrCategories)
    .orderBy(asc(refCcsrCategories.ccsrCategory))
  return c.json(ccsrCategoryListResponseSchema.parse({ items }))
})
