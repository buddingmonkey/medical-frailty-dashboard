import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { seedOverview } from '../test/overview-fixtures'
import { createDb } from './client'
import { publicCode } from './public-code'
import { appMeta, entries, sourceDocuments, states } from './schema'

// The code detail loader (roadmap M6 step 3), on the overview fixture (see its file).

const db = createDb(env.DB)

/** Adds an entry to a state's published version, from its first source document. */
async function addEntry(stateId: string, row: Partial<typeof entries.$inferInsert>) {
  const [state] = await db.select().from(states).where(eq(states.id, stateId))
  const [doc] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.stateId, stateId))
  if (!state?.publishedVersionId || !doc) throw new Error('fixture')
  await db.insert(entries).values({
    codeSystem: 'cpt',
    rawCode: '',
    codeNorm: '',
    stateCategory: 'Services',
    ...row,
    versionId: state.publishedVersionId,
    sourceDocumentId: doc.id,
  })
}

beforeEach(async () => {
  await seedOverview()
})

describe('publicCode', () => {
  it('returns null for a malformed path or a code nobody knows', async () => {
    expect(await publicCode(db, 'icd-10-cm', 'F20.*', 0)).toBeNull()
    expect(await publicCode(db, 'cpt', '99213', 0)).toBeNull()
  })

  it('shows a CPT code only with each state’s own text and source', async () => {
    await db.update(sourceDocuments).set({
      url: 'https://example.gov/ga.pdf',
      publisherDate: '2026-09-15',
    })
    await addEntry('GA', {
      rawCode: '99213',
      codeNorm: '99213',
      descriptionPublished: 'Office visit as GA wrote it',
      tier: 'A',
      sourceLocator: 'p. 4',
    })
    await addEntry('MT', {
      rawCode: '99210-99215',
      codeNorm: '99210',
      matchKind: 'range',
      rangeEndNorm: '99215',
      includesChildren: 0,
      qualification: 'standalone',
      qualificationBasis: 'inferred',
    })
    const body = await publicCode(db, 'cpt', '99213', 7)
    expect(body?.dataVersion).toBe(7)
    expect(body?.code).toMatchObject({ codeSystem: 'cpt', display: '99213', description: null })
    const ga = body?.states.find((s) => s.id === 'GA')
    expect(ga?.status).toBe('exact')
    expect(ga?.entries[0]).toMatchObject({
      rawCode: '99213',
      description: 'Office visit as GA wrote it',
      tier: 'A',
      source: {
        title: 'GA list published',
        url: 'https://example.gov/ga.pdf',
        publisherDate: '2026-09-15',
        locator: 'p. 4',
      },
    })
    const mt = body?.states.find((s) => s.id === 'MT')
    expect(mt).toMatchObject({ status: 'covered' })
    expect(mt?.entries[0]).toMatchObject({ display: '99210–99215', rawCode: '99210-99215' })
  })

  it('lists exact entries before covering ones, the strongest rule first', async () => {
    // GA lists F31.10 itself too, beside its F31.* wildcard.
    await addEntry('GA', {
      codeSystem: 'icd10cm',
      rawCode: 'F31.10',
      codeNorm: 'F3110',
      qualification: 'unknown',
    })
    const body = await publicCode(db, 'icd-10-cm', 'F31.10', 0)
    const ga = body?.states.find((s) => s.id === 'GA')
    expect(ga?.status).toBe('exact')
    expect(ga?.entries.map((e) => e.display)).toEqual(['F31.10', 'F31.*'])
  })

  it('hides only inferred rules with published_only', async () => {
    await addEntry('MT', {
      rawCode: 'F20.0',
      codeSystem: 'icd10cm',
      codeNorm: 'F200',
      qualification: 'standalone',
      qualificationBasis: 'inferred',
    })
    await db.insert(appMeta).values({ key: 'show_qualification', value: 'published_only' })
    const body = await publicCode(db, 'icd-10-cm', 'F20.0', 0)
    const rules = body?.states.flatMap((s) => s.entries.map((e) => [s.id, e.qualification]))
    expect(rules).toEqual([
      ['GA', 'standalone'],
      ['MT', null],
      ['MT', 'standalone'],
    ])
  })
})
