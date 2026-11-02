import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'

import { createDb } from '../db/client'
import {
  categoryMappings,
  chapterMappings,
  datasetVersions,
  entries,
  sourceDocuments,
  states,
  versionSources,
} from '../db/schema'
import { ADMIN } from './access-fixtures'
import { resetDb } from './reset-db'

// Published data for the public route tests: GA published (4 entries, a draft beside it, one
// manual and one auto mapping, a chapter 5 override), MT announced, NE with no list.

const db = createDb(env.DB)

type NewEntry = typeof entries.$inferInsert

export async function publishVersion(
  stateId: string,
  status: 'published' | 'draft',
  rows: Omit<NewEntry, 'versionId' | 'sourceDocumentId'>[],
  dates: { version?: string | null; source?: string | null } = {},
) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      stateId,
      title: `${stateId} list ${status}`,
      fileType: 'pdf',
      sha256: `${stateId}${status}`.padEnd(64, '0'),
      r2Key: `sources/${stateId}/${status}`,
      byteSize: 10,
      uploadedBy: ADMIN,
      publisherDate: dates.source ?? null,
    })
    .returning()
  const [version] = await db
    .insert(datasetVersions)
    .values({
      stateId,
      versionNo: status === 'published' ? 1 : 2,
      status,
      createdBy: ADMIN,
      statePublishedDate: dates.version ?? null,
      contentUpdatedAt: status === 'published' ? '2026-11-02T10:00:00.000Z' : null,
      rowCount: rows.length,
    })
    .returning()
  if (!doc || !version) throw new Error('insert failed')
  await db.insert(versionSources).values({ versionId: version.id, sourceDocumentId: doc.id })
  await db
    .insert(entries)
    .values(rows.map((r) => ({ ...r, versionId: version.id, sourceDocumentId: doc.id })))
  if (status === 'published') {
    await db
      .update(states)
      .set({ publishedVersionId: version.id, status: 'published' })
      .where(eq(states.id, stateId))
  }
}

export const icd = (codeNorm: string, stateCategory: string, patch: Partial<NewEntry> = {}) => ({
  codeSystem: 'icd10cm' as const,
  rawCode: codeNorm,
  codeNorm,
  stateCategory,
  ...patch,
})

/** Empties the database and loads the fixture states. Call in `beforeEach`. */
export async function seedPublicStates() {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
    { id: 'GA', slug: 'ga', name: 'Georgia', fips: '13' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30', status: 'announced' },
  ])
  await publishVersion(
    'GA',
    'published',
    [
      icd('F200', 'Mental health'),
      icd('F10', 'Mental health', { matchKind: 'prefix', qualification: 'needs_support' }),
      icd('C50', 'Cancer', { matchKind: 'prefix', qualification: 'standalone' }),
      { codeSystem: 'hcpcs', rawCode: 'E0250', codeNorm: 'E0250', stateCategory: 'Equipment' },
    ],
    { version: null, source: '2026-09-15' },
  )
  // A draft is never public.
  await publishVersion('GA', 'draft', [icd('Z99', 'Draft only')])
  await db.insert(categoryMappings).values([
    {
      stateId: 'GA',
      stateCategory: 'Mental health',
      federalCategory: 'disabling_mental_disorder',
      method: 'manual',
      mappedBy: ADMIN,
    },
    {
      stateId: 'GA',
      stateCategory: 'Cancer',
      federalCategory: 'serious_complex_medical',
      method: 'auto',
      confidence: 0.8,
    },
  ])
  // Chapter 5 (F01–F99) override: F10 counts as SUD even though its category says mental health.
  await db.insert(chapterMappings).values({
    stateId: 'GA',
    chapter: 5,
    federalCategory: 'sud',
    mappedBy: ADMIN,
  })
}
