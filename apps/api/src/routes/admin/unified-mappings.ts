import {
  ccsrGroupsCovered,
  mappingKey,
  stateUnifiedMappingsResponseSchema,
  type UnifiedMappingStatus,
  unifiedMappingApproveSchema,
  unifiedMappingPutSchema,
  unifiedMappingSaveResponseSchema,
  unifiedSuggestion,
} from '@mfcd/shared'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { loadCcsrIndex } from '../../db/ccsr'
import { createDb } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import { recomputePlacements } from '../../db/placement'
import {
  entries,
  refCcsrCategories,
  unifiedCategories,
  unifiedCcsr,
  unifiedMappings,
} from '../../db/schema'
import { recomputeAfterSave } from '../../middleware/errors'
import type { AppEnv } from '../../types'
import { actorOf, findStateParam, notFound } from './request'

// Mapping screen for unified categories (roadmap M5 step 3; docs/data-model.md, "Unified
// categories (M5)"). Mounted at /api/admin/states behind requireAdmin and adminWriteGuard.
// Rows are never deleted: a change marks the current rows `superseded`, pointing at the first
// new row. One admin may approve, their own proposal included (project lead, 2026-11-02).

/** The rows of one state category, matched the way `mappingKey` matches (trimmed, any case). */
function categoryRows(stateId: string, stateCategory: string, stateSubcategory: string) {
  return and(
    eq(unifiedMappings.stateId, stateId),
    sql`lower(trim(${unifiedMappings.stateCategory})) = ${stateCategory.trim().toLowerCase()}`,
    sql`lower(trim(${unifiedMappings.stateSubcategory})) = ${stateSubcategory.trim().toLowerCase()}`,
  )
}

const review = (status: 'approved' | 'proposed') =>
  unifiedMappingSaveResponseSchema.parse({
    ok: true,
    status,
    review: status === 'approved' ? 'Reviewed by one admin' : 'Proposed',
  })

export const unifiedMappingsRoute = new Hono<AppEnv>()
  .get('/:stateId/unified-mappings', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const versionId = state.publishedVersionId
    if (versionId === null) return c.json({ categories: [] })

    const [counts, icd, mappings, unified, unifiedGroups] = await db.batch([
      db
        .select({
          stateCategory: entries.stateCategory,
          stateSubcategory: entries.stateSubcategory,
          n: count(),
          icd: sql<number>`sum(${entries.codeSystem} = 'icd10cm')`.mapWith(Number),
        })
        .from(entries)
        .where(eq(entries.versionId, versionId))
        .groupBy(entries.stateCategory, entries.stateSubcategory)
        .orderBy(asc(entries.stateCategory), asc(entries.stateSubcategory)),
      db
        .select({
          stateCategory: entries.stateCategory,
          stateSubcategory: entries.stateSubcategory,
          codeNorm: entries.codeNorm,
          matchKind: entries.matchKind,
          rangeEndNorm: entries.rangeEndNorm,
          includesChildren: entries.includesChildren,
        })
        .from(entries)
        .where(and(eq(entries.versionId, versionId), eq(entries.codeSystem, 'icd10cm'))),
      db
        .select()
        .from(unifiedMappings)
        .where(
          and(
            eq(unifiedMappings.stateId, state.id),
            inArray(unifiedMappings.status, ['approved', 'proposed']),
          ),
        )
        .orderBy(asc(unifiedMappings.id)),
      db
        .select({
          id: unifiedCategories.id,
          label: unifiedCategories.label,
          status: unifiedCategories.status,
        })
        .from(unifiedCategories),
      db.select().from(unifiedCcsr),
    ])

    const index = await loadCcsrIndex(db, icd)

    const groupsByKey = new Map<string, string[][]>()
    for (const e of icd) {
      const key = `${e.stateCategory}\u0000${e.stateSubcategory}`
      const list = groupsByKey.get(key) ?? []
      list.push(ccsrGroupsCovered(e, index))
      groupsByKey.set(key, list)
    }
    const categoriesWithGroups = unified.map((u) => ({
      ...u,
      ccsr: unifiedGroups.filter((g) => g.unifiedId === u.id).map((g) => g.ccsrCategory),
    }))
    const suggestions = counts.map((cat) =>
      unifiedSuggestion(
        groupsByKey.get(`${cat.stateCategory}\u0000${cat.stateSubcategory}`) ?? [],
        categoriesWithGroups,
      ),
    )

    // Names of the suggested CCSR groups (one bound parameter for the list).
    const shown = [...new Set(suggestions.flatMap((s) => s.ccsr.map((g) => g.ccsrCategory)))]
    const names =
      shown.length === 0
        ? []
        : await db
            .select({
              ccsrCategory: refCcsrCategories.ccsrCategory,
              description: refCcsrCategories.description,
            })
            .from(refCcsrCategories)
            .where(
              sql`${refCcsrCategories.ccsrCategory} IN (SELECT value FROM json_each(${JSON.stringify(shown)}))`,
            )
    const nameOf = new Map(names.map((n) => [n.ccsrCategory, n.description]))

    return c.json(
      stateUnifiedMappingsResponseSchema.parse({
        categories: counts.map((cat, i) => {
          const key = mappingKey(cat.stateCategory, cat.stateSubcategory)
          const suggestion = suggestions[i] ?? { ccsr: [], unified: [], withoutCcsr: 0 }
          return {
            stateCategory: cat.stateCategory,
            stateSubcategory: cat.stateSubcategory,
            entries: cat.n,
            icdEntries: cat.icd,
            mappings: mappings.filter(
              (m) => mappingKey(m.stateCategory, m.stateSubcategory) === key,
            ),
            suggestion: {
              ...suggestion,
              ccsr: suggestion.ccsr.map((g) => ({
                ...g,
                description: nameOf.get(g.ccsrCategory) ?? null,
              })),
            },
          }
        }),
      }),
    )
  })

  .put('/:stateId/unified-mappings', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const parsed = unifiedMappingPutSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid mapping' }, 400)
    const body = parsed.data
    const { stateCategory, stateSubcategory } = body

    const [listed] = await db
      .select({ n: count() })
      .from(entries)
      .where(
        and(
          eq(entries.versionId, state.publishedVersionId ?? -1),
          eq(entries.stateCategory, stateCategory),
          eq(entries.stateSubcategory, stateSubcategory),
        ),
      )
    if (!listed || listed.n === 0) {
      return c.json({ error: 'That category is not in the state’s published list' }, 400)
    }

    const targets = 'targets' in body ? body.targets : []
    if (targets.length > 0) {
      const ids = targets.map((t) => t.unifiedId)
      const known = await db
        .select({ id: unifiedCategories.id })
        .from(unifiedCategories)
        .where(inArray(unifiedCategories.id, ids))
      const found = new Set(known.map((k) => k.id))
      const missing = ids.filter((id) => !found.has(id))
      if (missing.length > 0) {
        return c.json({ error: `Unknown unified category: ${missing.join(', ')}` }, 400)
      }
    }

    const actor = actorOf(c)
    const now = new Date().toISOString()
    const status = body.approve ? ('approved' as const) : ('proposed' as const)
    const common = {
      stateId: state.id,
      stateCategory,
      stateSubcategory,
      mappedBy: actor,
      mappedAt: now,
      status,
      reviewedBy: body.approve ? actor : null,
      reviewedAt: body.approve ? now : null,
    }
    const rows =
      'targets' in body
        ? body.targets.map((t) => ({ ...common, ...t }))
        : [
            {
              ...common,
              unifiedId: null,
              relation: 'by_code' as const,
              basis: body.basis,
              confidence: body.confidence,
              rationale: body.rationale,
              citation: body.citation,
            },
          ]
    // One insert per row (each well under D1's 100 bound parameters). In the batch's
    // transaction the new ids are consecutive, so the first is max(id) - (rows - 1).
    const inserts = rows.map((r) => db.insert(unifiedMappings).values(r))
    const firstNew = sql`((SELECT max(id) FROM unified_mappings) - ${rows.length - 1})`
    const replaced: UnifiedMappingStatus[] = body.approve ? ['proposed', 'approved'] : ['proposed']
    const [firstInsert, ...moreInserts] = inserts
    if (!firstInsert) return c.json({ error: 'Invalid mapping' }, 400)
    await db.batch([
      firstInsert,
      ...moreInserts,
      db
        .update(unifiedMappings)
        .set({ status: 'superseded', supersededBy: firstNew })
        .where(
          and(
            categoryRows(state.id, stateCategory, stateSubcategory),
            inArray(unifiedMappings.status, replaced),
            sql`${unifiedMappings.id} < ${firstNew}`,
          ),
        ),
      ...(body.approve ? [bumpDataVersion(db)] : []),
      auditInsert(db, {
        actorEmail: actor,
        action: 'unified-mapping.save',
        target: `state:${state.id}`,
        details: {
          stateCategory,
          stateSubcategory,
          status,
          targets:
            'targets' in body
              ? body.targets.map((t) => ({ unifiedId: t.unifiedId, relation: t.relation }))
              : 'by_code',
        },
      }),
    ])
    // A proposal changes no placement; an approval may.
    const recomputed = body.approve
      ? await recomputeAfterSave(c, () => recomputePlacements(db, { stateIds: [state.id] }))
      : {}
    return c.json(unifiedMappingSaveResponseSchema.parse({ ...review(status), ...recomputed }))
  })

  .post('/:stateId/unified-mappings/approve', async (c) => {
    const db = createDb(c.env.DB)
    const state = await findStateParam(db, c)
    if (!state) return notFound(c)
    const parsed = unifiedMappingApproveSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid mapping' }, 400)
    const { stateCategory, stateSubcategory } = parsed.data
    const proposed = await db
      .select({ id: unifiedMappings.id })
      .from(unifiedMappings)
      .where(
        and(
          categoryRows(state.id, stateCategory, stateSubcategory),
          eq(unifiedMappings.status, 'proposed'),
        ),
      )
      .orderBy(asc(unifiedMappings.id))
    const first = proposed[0]
    if (!first) return c.json({ error: 'There is no proposal to approve' }, 409)
    const actor = actorOf(c)
    await db.batch([
      db
        .update(unifiedMappings)
        .set({ status: 'superseded', supersededBy: first.id })
        .where(
          and(
            categoryRows(state.id, stateCategory, stateSubcategory),
            eq(unifiedMappings.status, 'approved'),
          ),
        ),
      db
        .update(unifiedMappings)
        .set({ status: 'approved', reviewedBy: actor, reviewedAt: new Date().toISOString() })
        .where(
          and(
            categoryRows(state.id, stateCategory, stateSubcategory),
            eq(unifiedMappings.status, 'proposed'),
          ),
        ),
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actor,
        action: 'unified-mapping.approve',
        target: `state:${state.id}`,
        details: { stateCategory, stateSubcategory, rows: proposed.length },
      }),
    ])
    const recomputed = await recomputeAfterSave(c, () =>
      recomputePlacements(db, { stateIds: [state.id] }),
    )
    return c.json(unifiedMappingSaveResponseSchema.parse({ ...review('approved'), ...recomputed }))
  })
