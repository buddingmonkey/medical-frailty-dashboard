import {
  autoMapCategory,
  categoryMappingSaveSchema,
  chapterOverrideSaveSchema,
  type FederalCategory,
  federalCategories,
  federalCategoryList,
  icd10cmChapterOf,
  icd10cmChapters,
  mappingKey,
  previewRemap,
  type RemapChanges,
  type RemapPreview,
  remapChangesSchema,
  remapPreviewResponseSchema,
  remapSaveSchema,
  sha256Hex,
  stateCategoriesResponseSchema,
} from '@mfcd/shared'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { unifiedParentsSql } from '../../db/federal'
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

const icdCategory = sql<string>`CASE WHEN ${entries.codeSystem} = 'icd10cm' THEN substr(${entries.codeNorm}, 1, 3) ELSE '' END`

/**
 * The remap preview (M7 step 3) with its token. Reads every published entry of the state once
 * (with its unified parents, one primary-key seek each), the open drafts' counts by category
 * and ICD-10-CM category, and the state's mappings and chapter overrides; writes nothing. The
 * token hashes everything the preview depends on, so a save after any change is refused.
 */
async function remapPreview(
  db: Db,
  state: { id: string; publishedVersionId: number | null },
  changes: RemapChanges,
): Promise<{
  preview: RemapPreview
  mappings: Map<string, FederalCategory>
  overrides: Map<number, FederalCategory>
}> {
  const [published, drafts, mappingRows, overrideRows] = await Promise.all([
    state.publishedVersionId === null
      ? Promise.resolve([])
      : db
          .select({
            codeSystem: entries.codeSystem,
            codeNorm: entries.codeNorm,
            rawCode: entries.rawCode,
            description: entries.descriptionPublished,
            stateCategory: entries.stateCategory,
            stateSubcategory: entries.stateSubcategory,
            parents: unifiedParentsSql,
          })
          .from(entries)
          .where(eq(entries.versionId, state.publishedVersionId))
          .orderBy(asc(entries.id)),
    db
      .select({
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
        icd: icdCategory,
        n: count(),
      })
      .from(entries)
      .innerJoin(datasetVersions, eq(datasetVersions.id, entries.versionId))
      .where(and(eq(datasetVersions.stateId, state.id), eq(datasetVersions.status, 'draft')))
      .groupBy(entries.stateCategory, entries.stateSubcategory, icdCategory)
      .orderBy(entries.stateCategory, entries.stateSubcategory, icdCategory),
    db
      .select({
        stateCategory: categoryMappings.stateCategory,
        stateSubcategory: categoryMappings.stateSubcategory,
        federalCategory: categoryMappings.federalCategory,
        method: categoryMappings.method,
      })
      .from(categoryMappings)
      .where(eq(categoryMappings.stateId, state.id))
      .orderBy(categoryMappings.stateCategory, categoryMappings.stateSubcategory),
    db
      .select({
        chapter: chapterMappings.chapter,
        federalCategory: chapterMappings.federalCategory,
      })
      .from(chapterMappings)
      .where(eq(chapterMappings.stateId, state.id))
      .orderBy(chapterMappings.chapter),
  ])
  const mappings = new Map(
    mappingRows.map((m) => [mappingKey(m.stateCategory, m.stateSubcategory), m.federalCategory]),
  )
  const overrides = new Map(overrideRows.map((o) => [o.chapter, o.federalCategory]))
  const result = previewRemap({
    entries: published.map((e) => ({ ...e, unifiedParents: federalCategoryList(e.parents) })),
    mappings,
    chapterOverrides: overrides,
    changes,
    draftGroups: drafts,
  })
  const token = await sha256Hex(
    new Uint8Array(
      new TextEncoder().encode(
        JSON.stringify({
          stateId: state.id,
          publishedVersionId: state.publishedVersionId,
          mappingRows,
          overrideRows,
          result,
        }),
      ),
    ),
  )
  return { preview: remapPreviewResponseSchema.parse({ token, ...result }), mappings, overrides }
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
    // Published entries placed in a published unified category take its federal parent; the
    // M2 mapping on this screen is only the fallback for the rest (docs/data-model.md).
    const placed =
      state.publishedVersionId === null
        ? []
        : await db
            .select({
              category: entries.stateCategory,
              subcategory: entries.stateSubcategory,
              parents: unifiedParentsSql,
              n: count(),
            })
            .from(entries)
            .where(eq(entries.versionId, state.publishedVersionId))
            .groupBy(entries.stateCategory, entries.stateSubcategory, unifiedParentsSql)
    const placedBy = new Map<string, { n: number; federal: Set<FederalCategory> }>()
    for (const r of placed) {
      const parents = federalCategoryList(r.parents)
      if (parents.length === 0) continue
      const key = `${r.category}\u0000${r.subcategory}`
      const p = placedBy.get(key) ?? { n: 0, federal: new Set<FederalCategory>() }
      p.n += r.n
      for (const f of parents) p.federal.add(f)
      placedBy.set(key, p)
    }

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
            const p = placedBy.get(`${cat.stateCategory}\u0000${cat.stateSubcategory}`)
            return {
              ...cat,
              placedEntries: p?.n ?? 0,
              placedFederal: federalCategories.filter((f) => p?.federal.has(f) === true),
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

  // Bulk remap, step 1: what the proposed changes would do (read-only; a POST for the body).
  .post('/:stateId/categories/preview', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findState(db, c)
    if (!state) return c.json({ error: 'Not found' }, 404)
    const body = remapChangesSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid changes' }, 400)
    const { preview } = await remapPreview(db, state, body.data)
    return c.json(preview)
  })

  // Bulk remap, step 2: save what was previewed, or 409 when anything changed since.
  .post('/:stateId/categories/remap', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findState(db, c)
    if (!state) return c.json({ error: 'Not found' }, 404)
    const body = remapSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid changes' }, 400)
    const { token, ...changes } = body.data
    const { preview, mappings, overrides } = await remapPreview(db, state, changes)
    if (preview.token !== token) {
      return c.json({ error: 'The data changed since the preview. Preview again.' }, 409)
    }
    const actor = c.var.identity?.email ?? ''
    const now = new Date().toISOString()
    const categoryWrites = changes.categories.map((item) => {
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
    const chapterWrites = changes.chapters.map(({ chapter, federalCategory }) =>
      federalCategory === null
        ? db
            .delete(chapterMappings)
            .where(and(eq(chapterMappings.stateId, state.id), eq(chapterMappings.chapter, chapter)))
        : db
            .insert(chapterMappings)
            .values({ stateId: state.id, chapter, federalCategory, mappedBy: actor, mappedAt: now })
            .onConflictDoUpdate({
              target: [chapterMappings.stateId, chapterMappings.chapter],
              set: { federalCategory, mappedBy: actor, mappedAt: now },
            }),
    )
    const moved = (i: number) => preview.changes[i]?.movingTotal ?? 0
    const audit = auditInsert(db, {
      actorEmail: actor,
      action: 'category.remap',
      target: `state:${state.id}`,
      details: {
        categories: changes.categories.map((item, i) => ({
          stateCategory: item.stateCategory,
          stateSubcategory: item.stateSubcategory,
          from: mappings.get(mappingKey(item.stateCategory, item.stateSubcategory)) ?? null,
          to: item.federalCategory,
          moved: moved(i),
        })),
        chapters: changes.chapters.map((item, i) => ({
          chapter: item.chapter,
          from: overrides.get(item.chapter) ?? null,
          to: item.federalCategory,
          moved: moved(changes.categories.length + i),
        })),
      },
    })
    await db.batch([audit, ...categoryWrites, ...chapterWrites, ...publicChange(db, state.id)])
    return c.json({ ok: true })
  })
