import {
  autoMapCategory,
  categoryMappingSaveSchema,
  chapterOverrideSaveSchema,
  icd10cmChapterOf,
  icd10cmChapters,
  mappingKey,
  stateCategoriesResponseSchema,
} from '@mfcd/shared'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import {
  categoryMappings,
  chapterMappings,
  datasetVersions,
  entries,
  states,
} from '../../db/schema'
import type { AppEnv } from '../../types'

// Category mapping screen (roadmap M2 step 9; docs/ingestion.md, "Category auto-mapping").
// Mounted at /api/admin/states behind requireAdmin and adminWriteGuard. Mappings belong to the
// state, not a version, so a re-upload keeps them. Every write is limited to one state.

async function findState(db: Db, c: Context<AppEnv>) {
  const id = c.req.param('stateId') ?? ''
  if (!/^[A-Z]{2}$/.test(id)) return undefined
  const [state] = await db
    .select({ id: states.id, publishedVersionId: states.publishedVersionId })
    .from(states)
    .where(eq(states.id, id))
  return state
}

/** A mapping change is a change to the public page: move its date and the cache key. */
function publicChange(db: Db, stateId: string) {
  return [
    db
      .update(datasetVersions)
      .set({ contentUpdatedAt: new Date().toISOString() })
      .where(and(eq(datasetVersions.stateId, stateId), eq(datasetVersions.status, 'published'))),
    bumpDataVersion(db),
  ] as const
}

export const categoriesRoute = new Hono<AppEnv>()
  .get('/:stateId/categories', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findState(db, c)
    if (!state) return c.json({ error: 'Not found' }, 404)
    const drafts = await db
      .select({ id: datasetVersions.id })
      .from(datasetVersions)
      .where(and(eq(datasetVersions.stateId, state.id), eq(datasetVersions.status, 'draft')))
    const draftIds = drafts.map((d) => d.id)

    const icdCategory = sql<string>`CASE WHEN ${entries.codeSystem} = 'icd10cm' THEN substr(${entries.codeNorm}, 1, 3) ELSE '' END`
    const countBy = (versionIds: number[]) =>
      versionIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              category: entries.stateCategory,
              subcategory: entries.stateSubcategory,
              icd: icdCategory,
              n: count(),
            })
            .from(entries)
            .where(inArray(entries.versionId, versionIds))
            .groupBy(entries.stateCategory, entries.stateSubcategory, icdCategory)
    const published = await countBy(
      state.publishedVersionId === null ? [] : [state.publishedVersionId],
    )
    const inDrafts = await countBy(draftIds)

    const categories = new Map<
      string,
      {
        stateCategory: string
        stateSubcategory: string
        publishedEntries: number
        draftEntries: number
      }
    >()
    const chapterCounts = new Map<number, { publishedEntries: number; draftEntries: number }>()
    const add = (rows: typeof published, field: 'publishedEntries' | 'draftEntries') => {
      for (const r of rows) {
        const key = `${r.category}\u0000${r.subcategory}`
        const cat = categories.get(key) ?? {
          stateCategory: r.category,
          stateSubcategory: r.subcategory,
          publishedEntries: 0,
          draftEntries: 0,
        }
        cat[field] += r.n
        categories.set(key, cat)
        const chapter = r.icd === '' ? null : icd10cmChapterOf(r.icd)
        if (chapter) {
          const counts = chapterCounts.get(chapter.number) ?? {
            publishedEntries: 0,
            draftEntries: 0,
          }
          counts[field] += r.n
          chapterCounts.set(chapter.number, counts)
        }
      }
    }
    add(published, 'publishedEntries')
    add(inDrafts, 'draftEntries')

    const mappings = await db
      .select()
      .from(categoryMappings)
      .where(eq(categoryMappings.stateId, state.id))
    const byKey = new Map(mappings.map((m) => [mappingKey(m.stateCategory, m.stateSubcategory), m]))
    const overrides = await db
      .select()
      .from(chapterMappings)
      .where(eq(chapterMappings.stateId, state.id))
    const overrideBy = new Map(overrides.map((o) => [o.chapter, o]))

    return c.json(
      stateCategoriesResponseSchema.parse({
        categories: [...categories.values()]
          .sort(
            (a, b) =>
              a.stateCategory.localeCompare(b.stateCategory) ||
              a.stateSubcategory.localeCompare(b.stateSubcategory),
          )
          .map((cat) => {
            const m = byKey.get(mappingKey(cat.stateCategory, cat.stateSubcategory))
            const auto = autoMapCategory(cat.stateCategory, cat.stateSubcategory)
            return {
              ...cat,
              mapping: m
                ? {
                    federalCategory: m.federalCategory,
                    method: m.method,
                    confidence: m.confidence,
                    mappedBy: m.mappedBy,
                    mappedAt: m.mappedAt,
                  }
                : null,
              suggestion: auto,
            }
          }),
        chapters: icd10cmChapters.map((ch) => {
          const o = overrideBy.get(ch.number)
          return {
            chapter: ch.number,
            title: ch.title,
            ...(chapterCounts.get(ch.number) ?? { publishedEntries: 0, draftEntries: 0 }),
            override: o
              ? { federalCategory: o.federalCategory, mappedBy: o.mappedBy, mappedAt: o.mappedAt }
              : null,
          }
        }),
      }),
    )
  })

  // Confirmed (manual) mappings, up to 200 at once ("confirm all suggestions").
  .put('/:stateId/categories', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findState(db, c)
    if (!state) return c.json({ error: 'Not found' }, 404)
    const body = categoryMappingSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid mappings' }, 400)
    const actor = c.var.identity?.email ?? ''
    const now = new Date().toISOString()
    const upserts = body.data.items.map((item) => {
      const values = {
        federalCategory: item.federalCategory,
        method: 'manual' as const,
        confidence: null,
        mappedBy: actor,
        mappedAt: now,
      }
      return db
        .insert(categoryMappings)
        .values({
          stateId: state.id,
          stateCategory: item.stateCategory,
          stateSubcategory: item.stateSubcategory,
          ...values,
        })
        .onConflictDoUpdate({
          target: [
            categoryMappings.stateId,
            categoryMappings.stateCategory,
            categoryMappings.stateSubcategory,
          ],
          set: values,
        })
    })
    const [first, ...rest] = upserts
    if (!first) return c.json({ error: 'Invalid mappings' }, 400)
    await db.batch([
      first,
      ...rest,
      ...publicChange(db, state.id),
      auditInsert(db, {
        actorEmail: actor,
        action: 'category.map',
        target: `state:${state.id}`,
        details: { items: body.data.items },
      }),
    ])
    return c.json({ ok: true })
  })

  .put('/:stateId/chapters/:chapter', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findState(db, c)
    const chapter = Number(c.req.param('chapter'))
    if (!state || !icd10cmChapters.some((ch) => ch.number === chapter)) {
      return c.json({ error: 'Not found' }, 404)
    }
    const body = chapterOverrideSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid override' }, 400)
    const actor = c.var.identity?.email ?? ''
    const { federalCategory } = body.data
    const change =
      federalCategory === null
        ? db
            .delete(chapterMappings)
            .where(and(eq(chapterMappings.stateId, state.id), eq(chapterMappings.chapter, chapter)))
        : db
            .insert(chapterMappings)
            .values({ stateId: state.id, chapter, federalCategory, mappedBy: actor })
            .onConflictDoUpdate({
              target: [chapterMappings.stateId, chapterMappings.chapter],
              set: { federalCategory, mappedBy: actor, mappedAt: new Date().toISOString() },
            })
    await db.batch([
      change,
      ...publicChange(db, state.id),
      auditInsert(db, {
        actorEmail: actor,
        action: 'chapter.map',
        target: `state:${state.id}`,
        details: { chapter, federalCategory },
      }),
    ])
    return c.json({ ok: true })
  })
