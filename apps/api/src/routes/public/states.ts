import { publicStateDetailResponseSchema, publicStatesResponseSchema } from '@mfcd/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicSummaries } from '../../db/public-summary'
import { datasetVersions, sourceDocuments, states, versionSources } from '../../db/schema'
import type { AppEnv } from '../../types'

// GET /api/public/states (roadmap M3 step 1): every state with its published counts, for the
// home map. GET /api/public/states/:slug (step 3): one state's page. Both cached on
// data_version (publicCache).

const safeUrl = (url: string | null) => (url !== null && /^https?:\/\//i.test(url) ? url : null)

export const publicStates = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return c.json(
      publicStatesResponseSchema.parse({ dataVersion: c.get('dataVersion') ?? 0, items }),
    )
  })
  .get('/:slug', async (c) => {
    const slug = c.req.param('slug').toLowerCase()
    if (!/^[a-z]{2}$/.test(slug)) return c.json({ error: 'Not found' }, 404)
    const db = createDb(c.env.DB)
    const [state] = await db
      .select({
        id: states.id,
        notesMd: states.notesMd,
        publishedVersionId: states.publishedVersionId,
      })
      .from(states)
      .where(eq(states.slug, slug))
    if (!state) return c.json({ error: 'Not found' }, 404)

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
            .orderBy(sourceDocuments.title),
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

    return c.json(
      publicStateDetailResponseSchema.parse({
        dataVersion: c.get('dataVersion') ?? 0,
        state: summaries.items[0],
        notesMd: state.notesMd,
        sources: sources.map((s) => ({ ...s, url: safeUrl(s.url) })),
        versions,
        categories: summaries.categories.get(state.id) ?? [],
      }),
    )
  })
