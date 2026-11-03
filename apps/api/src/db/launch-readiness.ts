import {
  launchGate,
  type LaunchReadinessResponse,
  type LaunchReadinessState,
  mappingKey,
  stateIsReady,
} from '@mfcd/shared'
import { asc, count, eq, inArray } from 'drizzle-orm'

import type { Db } from './client'
import { publicSummaries } from './public-summary'
import { categoryMappings, datasetVersions, entries, states, unifiedMappings } from './schema'

// Launch readiness (roadmap M8 step 1): for each state with a published list, how many of its
// categories still lack a confirmed mapping. Reads only through states.published_version_id,
// so drafts never count. Mappings match a category the way `mappingKey` does (trimmed, any
// case), as the mapping screens do.
//
// `notReviewed` comes from `publicSummaries`, the loader behind the public state page's
// "Review status" column, so the gate can never call a state ready while its page still shows
// "Not yet reviewed (automatic suggestion)".

export async function launchReadiness(db: Db): Promise<LaunchReadinessResponse> {
  const [published, categories, unified, federal, summaries] = await Promise.all([
    db
      .select({
        stateId: states.id,
        name: states.name,
        versionId: datasetVersions.id,
        versionNo: datasetVersions.versionNo,
        publishedAt: datasetVersions.publishedAt,
      })
      .from(states)
      .innerJoin(datasetVersions, eq(datasetVersions.id, states.publishedVersionId))
      .orderBy(asc(states.name)),
    db
      .select({
        stateId: states.id,
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
        n: count(),
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .groupBy(states.id, entries.stateCategory, entries.stateSubcategory),
    db
      .select({
        stateId: unifiedMappings.stateId,
        stateCategory: unifiedMappings.stateCategory,
        stateSubcategory: unifiedMappings.stateSubcategory,
        status: unifiedMappings.status,
      })
      .from(unifiedMappings)
      .where(inArray(unifiedMappings.status, ['approved', 'proposed'])),
    db
      .select({
        stateId: categoryMappings.stateId,
        stateCategory: categoryMappings.stateCategory,
        stateSubcategory: categoryMappings.stateSubcategory,
        federalCategory: categoryMappings.federalCategory,
        method: categoryMappings.method,
      })
      .from(categoryMappings),
    publicSummaries(db),
  ])

  const key = (r: { stateId: string; stateCategory: string; stateSubcategory: string }) =>
    `${r.stateId}\u0000${mappingKey(r.stateCategory, r.stateSubcategory)}`

  /** Per category key: has a current row, and has one still proposed. */
  const unifiedBy = new Map<string, { proposed: boolean }>()
  for (const m of unified) {
    const k = key(m)
    const seen = unifiedBy.get(k) ?? { proposed: false }
    if (m.status === 'proposed') seen.proposed = true
    unifiedBy.set(k, seen)
  }
  const federalBy = new Map(federal.map((m) => [key(m), m]))

  const notReviewedBy = new Map<string, Set<string>>()
  for (const [stateId, cats] of summaries.categories) {
    const open = new Set<string>()
    for (const c of cats) {
      if (!c.confirmed) open.add(`${c.stateCategory}\u0000${c.stateSubcategory}`)
    }
    notReviewedBy.set(stateId, open)
  }

  const rows: LaunchReadinessState[] = published.map((s) => {
    const counts = {
      categories: 0,
      unified: { unmapped: 0, unconfirmed: 0 },
      federal: { unmapped: 0, auto: 0 },
      notReviewed: notReviewedBy.get(s.stateId)?.size ?? 0,
    }
    for (const c of categories) {
      if (c.stateId !== s.stateId) continue
      counts.categories += 1
      const k = key(c)
      const u = unifiedBy.get(k)
      if (!u) counts.unified.unmapped += 1
      else if (u.proposed) counts.unified.unconfirmed += 1
      const f = federalBy.get(k)
      if (!f || f.federalCategory === 'unmapped') counts.federal.unmapped += 1
      if (f?.method === 'auto') counts.federal.auto += 1
    }
    return { ...s, ...counts, ready: stateIsReady(counts) }
  })

  return { states: rows, ...launchGate(rows) }
}
