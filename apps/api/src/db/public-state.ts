import {
  type FederalCategory,
  federalCategoriesOf,
  federalCategoryList,
  mappingKey,
  type PublicStateDetail,
  publicStateDetailResponseSchema,
} from '@mfcd/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import type { Db } from './client'
import { unifiedParentsSql } from './federal'
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

  const [summaries, sources, versions] = await Promise.all([
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
  ])

  return publicStateDetailResponseSchema.parse({
    dataVersion,
    state: summaries.items[0],
    notesMd: state.notesMd,
    sources: sources.map((s) => ({ ...s, url: safeUrl(s.url) })),
    versions,
    categories: summaries.categories.get(state.id) ?? [],
  })
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
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, entries.sourceDocumentId))
      .where(eq(states.id, stateId))
      .orderBy(asc(entries.codeSystem), asc(entries.codeNorm), asc(entries.id)),
    db.select().from(categoryMappings).where(eq(categoryMappings.stateId, stateId)),
    db.select().from(chapterMappings).where(eq(chapterMappings.stateId, stateId)),
  ])
  const byKey = new Map<string, FederalCategory>(
    mappings.map((m) => [mappingKey(m.stateCategory, m.stateSubcategory), m.federalCategory]),
  )
  const byChapter = new Map<number, FederalCategory>(
    overrides.map((o) => [o.chapter, o.federalCategory]),
  )
  return rows.map((r) => ({
    ...r.entry,
    federalCategories: federalCategoriesOf(
      r.entry,
      federalCategoryList(r.parents),
      byKey,
      byChapter,
    ),
    sourceTitle: r.sourceTitle,
    sourceUrl: safeUrl(r.sourceUrl),
    sourceDate: r.sourceDate,
  }))
}
