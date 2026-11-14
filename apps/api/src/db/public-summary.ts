import {
  codeSystems,
  confirmedRules,
  decodeStateFederal,
  decodeSuggestion,
  type FederalCategory,
  federalCategories,
  federalCategoryList,
  federalRuleOf,
  type PublicStateCategory,
  type PublicStateSummary,
  qualifications,
  zeroCounts,
} from '@mfcd/shared'
import { asc, count, eq, max, sql } from 'drizzle-orm'

import type { Db } from './client'
import { placementsReviewedSql, stateFederalSql, suggestionSql, unifiedParentsSql } from './federal'
import { mappingLookups } from './federal-suggestions'
import {
  categoryMappings,
  chapterMappings,
  datasetVersions,
  entries,
  sourceDocuments,
  states,
  versionSources,
} from './schema'

// The public summary of each state (home map, state pages): counts of the published version
// by code system, federal category and qualification, and the state's own categories with the
// federal categories each one counts under. Reads only through states.published_version_id, so
// drafts never show. Five queries, all states at once unless `stateId` narrows them.
//
// Federal categories (docs/data-model.md, "Federal categories"): an entry the state gave its own
// federal categories counts under exactly those; else once under each federal parent of its
// unified categories, so `byFederalCategory` can add up to more than `totalEntries`; an entry
// placed nowhere counts under a chapter override, a suggestion by code or its M2 mapping
// (`federalRuleOf`). Confirmed: stated by the state, or every placement reviewed, or, placed
// nowhere, a chapter override, a reviewed suggestion or a manual mapping.

export interface PublicSummaries {
  items: PublicStateSummary[]
  /** Each state's categories, one row per federal category its entries count under. */
  categories: Map<string, PublicStateCategory[]>
}

export async function publicSummaries(db: Db, stateId?: string): Promise<PublicSummaries> {
  const only = stateId === undefined ? undefined : eq(states.id, stateId)
  const icdCategory = sql<string>`CASE WHEN ${entries.codeSystem} = 'icd10cm' THEN substr(${entries.codeNorm}, 1, 3) ELSE '' END`

  const [stateRows, groups, mappings, overrides, sourceDates] = await Promise.all([
    db
      .select({
        id: states.id,
        slug: states.slug,
        name: states.name,
        fips: states.fips,
        status: states.status,
        versionNo: datasetVersions.versionNo,
        statePublishedDate: datasetVersions.statePublishedDate,
        contentUpdatedAt: datasetVersions.contentUpdatedAt,
      })
      .from(states)
      .leftJoin(datasetVersions, eq(datasetVersions.id, states.publishedVersionId))
      .where(only)
      .orderBy(asc(states.name)),
    db
      .select({
        stateId: states.id,
        codeSystem: entries.codeSystem,
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
        qualification: entries.qualification,
        icd: icdCategory,
        stateFederal: stateFederalSql,
        parents: unifiedParentsSql,
        reviewed: placementsReviewedSql,
        suggestion: suggestionSql,
        n: count(),
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .where(only)
      .groupBy(
        states.id,
        entries.codeSystem,
        entries.stateCategory,
        entries.stateSubcategory,
        entries.qualification,
        icdCategory,
        stateFederalSql,
        unifiedParentsSql,
        placementsReviewedSql,
        suggestionSql,
      ),
    db
      .select()
      .from(categoryMappings)
      .where(stateId === undefined ? undefined : eq(categoryMappings.stateId, stateId)),
    db
      .select()
      .from(chapterMappings)
      .where(stateId === undefined ? undefined : eq(chapterMappings.stateId, stateId)),
    db
      .select({ stateId: states.id, date: max(sourceDocuments.publisherDate) })
      .from(states)
      .innerJoin(versionSources, eq(versionSources.versionId, states.publishedVersionId))
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, versionSources.sourceDocumentId))
      .where(only)
      .groupBy(states.id),
  ])

  const lookupsBy = new Map(
    [...new Set(mappings.map((m) => m.stateId))].map((id) => [
      id,
      mappingLookups(mappings.filter((m) => m.stateId === id)),
    ]),
  )
  const overridesBy = new Map<string, Map<number, FederalCategory>>()
  for (const o of overrides) {
    const forState = overridesBy.get(o.stateId) ?? new Map<number, FederalCategory>()
    forState.set(o.chapter, o.federalCategory)
    overridesBy.set(o.stateId, forState)
  }
  const sourceDateBy = new Map(sourceDates.map((s) => [s.stateId, s.date]))

  const published = new Map<string, NonNullable<PublicStateSummary['published']>>()
  for (const s of stateRows) {
    if (s.versionNo === null) continue
    published.set(s.id, {
      versionNo: s.versionNo,
      sourceDate: s.statePublishedDate ?? sourceDateBy.get(s.id) ?? null,
      updatedAt: s.contentUpdatedAt,
      totalEntries: 0,
      bySystem: zeroCounts(codeSystems),
      byFederalCategory: zeroCounts(federalCategories),
      byQualification: zeroCounts(qualifications),
      mappingsConfirmed: true,
    })
  }

  const categories = new Map<string, Map<string, PublicStateCategory>>()
  /** Per row key: the reference states of its suggested entries, or null once another kind is unconfirmed. */
  const suggestedBy = new Map<string, Set<string> | null>()
  const noLookups = mappingLookups([])
  const noOverrides = new Map<number, FederalCategory>()
  for (const g of groups) {
    const p = published.get(g.stateId)
    if (!p) continue
    const stateOverrides = overridesBy.get(g.stateId) ?? noOverrides
    const entry = {
      codeSystem: g.codeSystem,
      // The 3-character category is enough to find the ICD-10-CM chapter.
      codeNorm: g.icd,
      stateCategory: g.stateCategory,
      stateSubcategory: g.stateSubcategory,
      stateFederalCategories: decodeStateFederal(g.stateFederal),
      suggestion: decodeSuggestion(g.suggestion),
    }
    const stated = entry.stateFederalCategories.length > 0
    const parents = federalCategoryList(g.parents)
    const lookups = lookupsBy.get(g.stateId) ?? noLookups
    const { rule, categories: federal } = federalRuleOf(
      entry,
      parents,
      lookups.mappings,
      stateOverrides,
      lookups.manualKeys,
    )
    p.totalEntries += g.n
    p.bySystem[g.codeSystem] += g.n
    for (const f of federal) p.byFederalCategory[f] += g.n
    p.byQualification[g.qualification] += g.n

    let confirmed: boolean
    if (stated) {
      // The state published the federal category: nothing for an admin to review.
      confirmed = true
    } else if (parents.length > 0) {
      // Placed: an admin reviewed every placement (an approved mapping or by_code row).
      confirmed = g.reviewed === 1
    } else {
      // Placed nowhere: a chapter override (always set by hand), a reviewed suggestion or a
      // manual mapping decides it.
      confirmed = confirmedRules.has(rule)
    }
    if (!confirmed) p.mappingsConfirmed = false

    const forState = categories.get(g.stateId) ?? new Map<string, PublicStateCategory>()
    for (const f of federal) {
      const key = `${g.stateCategory}\u0000${g.stateSubcategory}\u0000${f}`
      const cat = forState.get(key) ?? {
        stateCategory: g.stateCategory,
        stateSubcategory: g.stateSubcategory,
        federalCategory: f,
        confirmed: true,
        stated: true,
        entries: 0,
      }
      cat.entries += g.n
      if (!confirmed) {
        cat.confirmed = false
        const names = suggestedBy.get(`${g.stateId}\u0000${key}`)
        if (rule === 'suggested' && names !== null) {
          const set = names ?? new Set<string>()
          for (const n of entry.suggestion?.referenceNames ?? []) set.add(n)
          suggestedBy.set(`${g.stateId}\u0000${key}`, set)
        } else suggestedBy.set(`${g.stateId}\u0000${key}`, null)
      }
      if (!stated) cat.stated = false
      forState.set(key, cat)
    }
    categories.set(g.stateId, forState)
  }

  return {
    items: stateRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      fips: s.fips,
      status: s.status,
      published: published.get(s.id) ?? null,
    })),
    categories: new Map(
      [...categories].map(([id, cats]) => [
        id,
        [...cats]
          .map(([key, cat]) => {
            const names = suggestedBy.get(`${id}\u0000${key}`)
            return names && names.size > 0 ? { ...cat, suggestedFrom: [...names].sort() } : cat
          })
          .sort(
            (a, b) =>
              a.stateCategory.localeCompare(b.stateCategory) ||
              a.stateSubcategory.localeCompare(b.stateSubcategory) ||
              federalCategories.indexOf(a.federalCategory) -
                federalCategories.indexOf(b.federalCategory),
          ),
      ]),
    ),
  }
}
