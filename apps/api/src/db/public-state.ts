import {
  decodeStateFederal,
  decodeSuggestion,
  type FederalCategory,
  federalCategoriesOf,
  federalCategoryList,
  type PublicStateDetail,
  publicStateDetailResponseSchema,
  SIMILAR_STATES_SHOWN,
  type SimilarState,
} from '@mfcd/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import type { Db } from './client'
import { suggestionSql, unifiedParentsSql } from './federal'
import { mappingLookups } from './federal-suggestions'
import { publicSummaries } from './public-summary'
import {
  categoryMappings,
  chapterMappings,
  datasetVersions,
  entries,
  sourceDocuments,
  states,
  versionSources,
} from './schema'

// One state's public data: the JSON API, the server-rendered page and the downloads all read
// it from here, so they cannot disagree.

const safeUrl = (url: string | null) => (url !== null && /^https?:\/\//i.test(url) ? url : null)

/** The state with this lowercase slug, or null. */
export async function publicStateDetail(
  db: Db,
  slug: string,
  dataVersion: number,
): Promise<PublicStateDetail | null> {
  if (!/^[a-z]{2}$/.test(slug)) return null
  const [state] = await db
    .select({
      id: states.id,
      notesMd: states.notesMd,
      publishedVersionId: states.publishedVersionId,
    })
    .from(states)
    .where(eq(states.slug, slug))
  if (!state) return null

  const [summaries, sources, versions, similar] = await Promise.all([
    publicSummaries(db, state.id),
    state.publishedVersionId === null
      ? Promise.resolve([])
      : db
          .select({
            title: sourceDocuments.title,
            url: sourceDocuments.url,
            publisherDate: sourceDocuments.publisherDate,
            retrievedAt: sourceDocuments.retrievedAt,
            fileType: sourceDocuments.fileType,
          })
          .from(versionSources)
          .innerJoin(sourceDocuments, eq(sourceDocuments.id, versionSources.sourceDocumentId))
          .where(eq(versionSources.versionId, state.publishedVersionId))
          .orderBy(asc(sourceDocuments.title)),
    db
      .select({
        versionNo: datasetVersions.versionNo,
        status: datasetVersions.status,
        publishedAt: datasetVersions.publishedAt,
        statePublishedDate: datasetVersions.statePublishedDate,
        rowCount: datasetVersions.rowCount,
      })
      .from(datasetVersions)
      .where(
        and(
          eq(datasetVersions.stateId, state.id),
          inArray(datasetVersions.status, ['published', 'superseded']),
        ),
      )
      .orderBy(desc(datasetVersions.versionNo)),
    state.publishedVersionId === null ? Promise.resolve([]) : similarStates(db, state.id),
  ])

  return publicStateDetailResponseSchema.parse({
    dataVersion,
    state: summaries.items[0],
    notesMd: state.notesMd,
    sources: sources.map((s) => ({ ...s, url: safeUrl(s.url) })),
    versions,
    categories: summaries.categories.get(state.id) ?? [],
    similar,
  })
}

/**
 * The states whose lists are most like this state's (roadmap M5 step 7), read from
 * `state_similarity` (src/db/similarity.ts): most similar first, then by name. Only states that
 * still have a list (a pair row outlives nothing, but this keeps the page honest if it did).
 */
async function similarStates(db: Db, stateId: string): Promise<SimilarState[]> {
  return db.all<SimilarState>(sql`
    SELECT o.id, o.slug, o.name, p.jaccard, p.shared,
      CASE WHEN p.state_a = ${stateId} THEN p.only_a ELSE p.only_b END AS onlyThis,
      CASE WHEN p.state_a = ${stateId} THEN p.only_b ELSE p.only_a END AS onlyOther
    FROM state_similarity p
    JOIN states o ON o.id = CASE WHEN p.state_a = ${stateId} THEN p.state_b ELSE p.state_a END
    WHERE (p.state_a = ${stateId} OR p.state_b = ${stateId}) AND o.published_version_id IS NOT NULL
    ORDER BY p.jaccard DESC, o.name
    LIMIT ${SIMILAR_STATES_SHOWN}`)
}

/** Every entry of a state's published list, with its federal categories and source, by code. */
export async function publishedEntriesForDownload(db: Db, stateId: string) {
  const [rows, mappings, overrides] = await Promise.all([
    db
      .select({
        entry: entries,
        sourceTitle: sourceDocuments.title,
        sourceUrl: sourceDocuments.url,
        sourceDate: sourceDocuments.publisherDate,
        parents: unifiedParentsSql,
        suggestion: suggestionSql,
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, entries.sourceDocumentId))
      .where(eq(states.id, stateId))
      .orderBy(asc(entries.codeSystem), asc(entries.codeNorm), asc(entries.id)),
    db.select().from(categoryMappings).where(eq(categoryMappings.stateId, stateId)),
    db.select().from(chapterMappings).where(eq(chapterMappings.stateId, stateId)),
  ])
  const { mappings: byKey, manualKeys } = mappingLookups(mappings)
  const byChapter = new Map<number, FederalCategory>(
    overrides.map((o) => [o.chapter, o.federalCategory]),
  )
  return rows.map((r) => ({
    ...r.entry,
    federalCategories: federalCategoriesOf(
      {
        ...r.entry,
        stateFederalCategories: decodeStateFederal(r.entry.stateFederalCategories),
        suggestion: decodeSuggestion(r.suggestion),
      },
      federalCategoryList(r.parents),
      byKey,
      byChapter,
      manualKeys,
    ),
    sourceTitle: r.sourceTitle,
    sourceUrl: safeUrl(r.sourceUrl),
    sourceDate: r.sourceDate,
  }))
}
