import {
  autoMapCategory,
  categoryMappingSaveSchema,
  type FederalCategory,
  federalCategories,
  decodeStateFederal,
  decodeSuggestion,
  diffSuggestions,
  federalCategoryList,
  federalRuleOf,
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
  suggestionConfirmSchema,
  suggestionRunPreviewSchema,
  suggestionRunSaveSchema,
} from '@mfcd/shared'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { stateFederalSql, suggestionSql, unifiedParentsSql } from '../../db/federal'
import {
  applyingSuggestionIds,
  confirmSuggestionStatements,
  loadSuggestionReference,
  mappingLookups,
  planSuggestions,
  planToken,
  writeSuggestionPlan,
} from '../../db/federal-suggestions'
import { bumpDataVersion } from '../../db/meta'
import { categoryMappings, chapterMappings, datasetVersions, entries } from '../../db/schema'
import type { AppEnv } from '../../types'
import { actorOf, findStateParam, notFound } from './request'

// Category mapping screen (roadmap M2 step 9; docs/ingestion.md, "Category auto-mapping").
// Mounted at /api/admin/states behind requireAdmin and adminWriteGuard. Mappings belong to the
// state, not a version, so a re-upload keeps them. Every write is limited to one state.

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
            stateFederal: stateFederalSql,
            parents: unifiedParentsSql,
            suggestion: suggestionSql,
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
  const { mappings, manualKeys } = mappingLookups(mappingRows)
  const overrides = new Map(overrideRows.map((o) => [o.chapter, o.federalCategory]))
  const result = previewRemap({
    entries: published.map(({ stateFederal, parents, suggestion, ...e }) => ({
      ...e,
      unifiedParents: federalCategoryList(parents),
      stateFederalCategories: decodeStateFederal(stateFederal),
      suggestion: decodeSuggestion(suggestion),
    })),
    mappings,
    manualKeys,
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

/** Entries shown in the re-run preview's sample. */
const SUGGESTION_SAMPLE = 20

/** The preview of "Re-run automatic suggestions", with its token. */
async function suggestionRunPreview(db: Db, stateId: string) {
  const { reference, names } = await loadSuggestionReference(db)
  const plan = await planSuggestions(db, stateId, reference)
  return suggestionRunPreviewSchema.parse({
    token: await planToken(plan, names),
    reference: names,
    entries: plan.entries,
    ...diffSuggestions(plan.changes, SUGGESTION_SAMPLE),
  })
}

export const categoriesRoute = new Hono<AppEnv>()
  .get('/:stateId/categories', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
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
    // Published entries whose state published their federal category count under it; the
    // others placed in a published unified category take its federal parent; the M2 mapping on
    // this screen is only the fallback for the rest (docs/data-model.md).
    const placed =
      state.publishedVersionId === null
        ? []
        : await db
            .select({
              category: entries.stateCategory,
              subcategory: entries.stateSubcategory,
              stateFederal: stateFederalSql,
              parents: unifiedParentsSql,
              n: count(),
            })
            .from(entries)
            .where(eq(entries.versionId, state.publishedVersionId))
            .groupBy(
              entries.stateCategory,
              entries.stateSubcategory,
              stateFederalSql,
              unifiedParentsSql,
            )
    const placedBy = new Map<string, { n: number; federal: Set<FederalCategory> }>()
    const statedBy = new Map<string, { n: number; federal: Set<FederalCategory> }>()
    for (const r of placed) {
      const stated = decodeStateFederal(r.stateFederal)
      const parents = federalCategoryList(r.parents)
      const [by, federal] =
        stated.length > 0 ? [statedBy, stated] : parents.length > 0 ? [placedBy, parents] : []
      if (!by || !federal) continue
      const key = `${r.category}\u0000${r.subcategory}`
      const p = by.get(key) ?? { n: 0, federal: new Set<FederalCategory>() }
      p.n += r.n
      for (const f of federal) p.federal.add(f)
      by.set(key, p)
    }

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

    // Published entries whose federal categories come from a suggestion by code (rules 4 and
    // 6), grouped so the rule runs once per kind of entry, not once per entry.
    const withSuggestion =
      state.publishedVersionId === null
        ? []
        : await db
            .select({
              category: entries.stateCategory,
              subcategory: entries.stateSubcategory,
              codeSystem: entries.codeSystem,
              icd: icdCategory,
              stateFederal: stateFederalSql,
              parents: unifiedParentsSql,
              suggestion: suggestionSql,
              n: count(),
            })
            .from(entries)
            .where(
              and(
                eq(entries.versionId, state.publishedVersionId),
                sql`EXISTS (SELECT 1 FROM entry_federal_suggestions s WHERE s.entry_id = ${entries.id})`,
              ),
            )
            .groupBy(
              entries.stateCategory,
              entries.stateSubcategory,
              entries.codeSystem,
              icdCategory,
              stateFederalSql,
              unifiedParentsSql,
              suggestionSql,
            )
    const lookups = mappingLookups(mappings)
    const overrideMap = new Map(overrides.map((o) => [o.chapter, o.federalCategory]))
    const suggestedBy = new Map<
      string,
      { entries: number; pending: number; federal: Set<FederalCategory>; names: Set<string> }
    >()
    for (const r of withSuggestion) {
      const suggestion = decodeSuggestion(r.suggestion)
      const { rule, categories: federal } = federalRuleOf(
        {
          codeSystem: r.codeSystem,
          codeNorm: r.icd,
          stateCategory: r.category,
          stateSubcategory: r.subcategory,
          stateFederalCategories: decodeStateFederal(r.stateFederal),
          suggestion,
        },
        federalCategoryList(r.parents),
        lookups.mappings,
        overrideMap,
        lookups.manualKeys,
      )
      if (rule !== 'suggested' && rule !== 'suggestedReviewed') continue
      const key = `${r.category}\u0000${r.subcategory}`
      const t = suggestedBy.get(key) ?? {
        entries: 0,
        pending: 0,
        federal: new Set<FederalCategory>(),
        names: new Set<string>(),
      }
      t.entries += r.n
      if (rule === 'suggested') t.pending += r.n
      for (const f of federal) t.federal.add(f)
      for (const n of suggestion?.referenceNames ?? []) t.names.add(n)
      suggestedBy.set(key, t)
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
            const st = statedBy.get(`${cat.stateCategory}\u0000${cat.stateSubcategory}`)
            const sg = suggestedBy.get(`${cat.stateCategory}\u0000${cat.stateSubcategory}`)
            return {
              ...cat,
              statedEntries: st?.n ?? 0,
              statedFederal: federalCategories.filter((f) => st?.federal.has(f) === true),
              placedEntries: p?.n ?? 0,
              placedFederal: federalCategories.filter((f) => p?.federal.has(f) === true),
              codeSuggested: {
                entries: sg?.entries ?? 0,
                pending: sg?.pending ?? 0,
                federal: federalCategories.filter((f) => sg?.federal.has(f) === true),
                referenceNames: [...(sg?.names ?? [])].sort(),
              },
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

  // Confirm mappings (manual), up to 200 at once ("Confirm all guesses"), only when no published
  // entry moves: the stored federal category unchanged, or a category with no published entries
  // (draft only). Any other change goes through the preview and /remap (M7 step 3): 409. A
  // manual mapping wins over unreviewed suggestions by code, so the suggestions that decide an
  // entry of these categories now are confirmed in the same batch: nothing moves.
  .put('/:stateId/categories', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const body = categoryMappingSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid mappings' }, 400)
    const stored = await db
      .select({
        stateCategory: categoryMappings.stateCategory,
        stateSubcategory: categoryMappings.stateSubcategory,
        federalCategory: categoryMappings.federalCategory,
      })
      .from(categoryMappings)
      .where(eq(categoryMappings.stateId, state.id))
    const storedBy = new Map(
      stored.map((m) => [mappingKey(m.stateCategory, m.stateSubcategory), m.federalCategory]),
    )
    // Categories with published entries; a new choice for any other moves no published entry.
    const publishedKeys = new Set(
      state.publishedVersionId === null
        ? []
        : (
            await db
              .selectDistinct({
                category: entries.stateCategory,
                subcategory: entries.stateSubcategory,
              })
              .from(entries)
              .where(eq(entries.versionId, state.publishedVersionId))
          ).map((r) => mappingKey(r.category, r.subcategory)),
    )
    const changes = body.data.items.some((item) => {
      const key = mappingKey(item.stateCategory, item.stateSubcategory)
      return publishedKeys.has(key) && storedBy.get(key) !== item.federalCategory
    })
    if (changes) {
      return c.json({ error: 'This changes a federal category. Preview the change first.' }, 409)
    }
    const actor = actorOf(c)
    const now = new Date().toISOString()
    const suggested = await applyingSuggestionIds(
      db,
      state,
      new Set(body.data.items.map((item) => mappingKey(item.stateCategory, item.stateSubcategory))),
    )
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
      ...confirmSuggestionStatements(db, suggested, actor, now),
      ...publicChange(db, state.id),
      auditInsert(db, {
        actorEmail: actor,
        action: 'category.map',
        target: `state:${state.id}`,
        details: { items: body.data.items, suggestionsConfirmed: suggested.length },
      }),
    ])
    return c.json({ ok: true })
  })

  // Suggestions by code, step 1 of "Re-run automatic suggestions": what a run would change for
  // the state's published entries (read-only; a POST like the remap preview).
  .post('/:stateId/categories/suggestions/preview', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    return c.json(await suggestionRunPreview(db, state.id))
  })

  // Step 2: run it, or 409 when anything changed since the preview. Writes only the difference
  // (src/db/federal-suggestions.ts); reviewed suggestions, stated categories, placements,
  // chapter overrides and mappings are never touched.
  .post('/:stateId/categories/suggestions/run', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const body = suggestionRunSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    const { reference, names } = await loadSuggestionReference(db)
    const plan = await planSuggestions(db, state.id, reference)
    if ((await planToken(plan, names)) !== body.data.token) {
      return c.json({ error: 'The data changed since the preview. Preview again.' }, 409)
    }
    const diff = diffSuggestions(plan.changes, 0)
    const actor = actorOf(c)
    await writeSuggestionPlan(db, plan, [
      ...publicChange(db, state.id),
      auditInsert(db, {
        actorEmail: actor,
        action: 'category.suggest',
        target: `state:${state.id}`,
        details: {
          reference: names,
          gain: diff.gain,
          change: diff.change,
          lose: diff.lose,
          keptReviewed: diff.keptReviewed,
          byCategory: diff.byCategory,
        },
      }),
    ])
    return c.json({ ok: true })
  })

  // "Confirm suggestions": the unreviewed suggestions that decide the federal category of the
  // published entries in these state categories now. Moves nothing.
  .post('/:stateId/categories/suggestions/confirm', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const body = suggestionConfirmSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid categories' }, 400)
    const keys = new Set(
      body.data.items.map((item) => mappingKey(item.stateCategory, item.stateSubcategory)),
    )
    const ids = await applyingSuggestionIds(db, state, keys)
    const actor = actorOf(c)
    const now = new Date().toISOString()
    await db.batch([
      auditInsert(db, {
        actorEmail: actor,
        action: 'category.suggest.confirm',
        target: `state:${state.id}`,
        details: { items: body.data.items, entries: ids.length },
      }),
      ...confirmSuggestionStatements(db, ids, actor, now),
      ...publicChange(db, state.id),
    ])
    return c.json({ ok: true, confirmed: ids.length })
  })

  // Bulk remap, step 1: what the proposed changes would do (read-only; a POST for the body).
  .post('/:stateId/categories/preview', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const body = remapChangesSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid changes' }, 400)
    const { preview } = await remapPreview(db, state, body.data)
    return c.json(preview)
  })

  // Bulk remap, step 2: save what was previewed, or 409 when anything changed since.
  .post('/:stateId/categories/remap', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const body = remapSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid changes' }, 400)
    const { token, ...changes } = body.data
    const { preview, mappings, overrides } = await remapPreview(db, state, changes)
    if (preview.token !== token) {
      return c.json({ error: 'The data changed since the preview. Preview again.' }, 409)
    }
    const actor = actorOf(c)
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
