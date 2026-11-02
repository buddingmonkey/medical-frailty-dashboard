import {
  type CheckEntry,
  draftChecksResponseSchema,
  draftCreateSchema,
  draftDetailSchema,
  draftListQuerySchema,
  type DraftEntry,
  draftListResponseSchema,
  draftRowsRequestSchema,
  draftSourceSchema,
  draftSummarySchema,
  entryAttributesSchema,
  namedStateIdsSchema,
  routeIdSchema,
  runChecks,
  sha256Hex,
  validateDraftEntry,
} from '@mfcd/shared'
import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import {
  datasetVersions,
  entries,
  refCodes,
  sourceDocuments,
  states,
  versionSources,
} from '../../db/schema'
import type { AppEnv } from '../../types'

// Draft versions (docs/ingestion.md, steps 6 and 7). Mounted behind requireAdmin and
// adminWriteGuard. Every write is limited to one draft (`version_id`) whose status is 'draft':
// published and superseded versions are never changed here.

/** Entry columns bound per INSERT; D1 allows 100 parameters per statement. */
const ROWS_PER_INSERT = 6
/** Codes per ref_codes lookup. */
const LOOKUP_CHUNK = 100

const idParam = routeIdSchema

const summaryColumns = {
  id: datasetVersions.id,
  stateId: datasetVersions.stateId,
  versionNo: datasetVersions.versionNo,
  status: datasetVersions.status,
  label: datasetVersions.label,
  createdBy: datasetVersions.createdBy,
  createdAt: datasetVersions.createdAt,
  rowCount: datasetVersions.rowCount,
}

async function findVersion(db: Db, id: number) {
  const [row] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, id))
  return row
}

const actorOf = (c: Context<AppEnv>) => c.var.identity?.email ?? ''

/** Rows of a version as the checks see them. */
async function checkEntries(db: Db, versionId: number): Promise<CheckEntry[]> {
  const rows = await db
    .select({
      codeSystem: entries.codeSystem,
      rawCode: entries.rawCode,
      codeNorm: entries.codeNorm,
      matchKind: entries.matchKind,
      rangeEndNorm: entries.rangeEndNorm,
      stateCategory: entries.stateCategory,
      stateSubcategory: entries.stateSubcategory,
      descriptionPublished: entries.descriptionPublished,
      attributesJson: entries.attributesJson,
    })
    .from(entries)
    .where(eq(entries.versionId, versionId))
  return rows.map((r) => {
    const attributes = entryAttributesSchema.safeParse(JSON.parse(r.attributesJson ?? '{}'))
    return {
      codeSystem: r.codeSystem,
      codeNorm: r.codeNorm,
      matchKind: r.matchKind,
      rangeEndNorm: r.rangeEndNorm,
      stateCategory: r.stateCategory,
      stateSubcategory: r.stateSubcategory,
      descriptionPublished: r.descriptionPublished,
      included: attributes.success ? attributes.data.included : true,
      unresolvedFlags: attributes.success ? attributes.data.flags : [],
    }
  })
}

async function sourcesOf(db: Db, versionId: number) {
  const rows = await db
    .select({
      sourceDocumentId: versionSources.sourceDocumentId,
      title: sourceDocuments.title,
      sha256: sourceDocuments.sha256,
      expectedEntries: versionSources.expectedEntries,
      invalidRowCount: versionSources.invalidRowCount,
      namedStateIdsJson: versionSources.namedStateIdsJson,
    })
    .from(versionSources)
    .innerJoin(sourceDocuments, eq(versionSources.sourceDocumentId, sourceDocuments.id))
    .where(eq(versionSources.versionId, versionId))
    .orderBy(asc(versionSources.sourceDocumentId))
  const stored = await db
    .select({ sourceDocumentId: entries.sourceDocumentId, n: count() })
    .from(entries)
    .where(eq(entries.versionId, versionId))
    .groupBy(entries.sourceDocumentId)
  const storedBy = new Map(stored.map((s) => [s.sourceDocumentId, s.n]))
  return rows.map(({ namedStateIdsJson, ...r }) => ({
    ...r,
    storedEntries: storedBy.get(r.sourceDocumentId) ?? 0,
    namedStateIds: namedStateIdsSchema.parse(JSON.parse(namedStateIdsJson)),
  }))
}

/** The rows' fingerprint: changes whenever an entry or a source of the draft changes. */
async function draftToken(db: Db, versionId: number): Promise<string> {
  const ids = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.versionId, versionId))
    .orderBy(asc(entries.id))
  const sources = await db
    .select()
    .from(versionSources)
    .where(eq(versionSources.versionId, versionId))
    .orderBy(asc(versionSources.sourceDocumentId))
  const text = JSON.stringify({ versionId, ids: ids.map((r) => r.id), sources })
  return sha256Hex(new Uint8Array(new TextEncoder().encode(text)))
}

/** ICD-10-CM codes of `codes` that exist in ref_codes. */
async function knownIcd10cm(db: Db, codes: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(codes)]
  const select = (chunk: string[]) =>
    db
      .select({ codeNorm: refCodes.codeNorm })
      .from(refCodes)
      .where(and(eq(refCodes.codeSystem, 'icd10cm'), inArray(refCodes.codeNorm, chunk)))
  const queries = []
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    queries.push(select(unique.slice(i, i + LOOKUP_CHUNK)))
  }
  const [first, ...rest] = queries
  if (!first) return new Set()
  const results = await db.batch([first, ...rest])
  return new Set(results.flat().map((r) => r.codeNorm))
}

function entryRow(versionId: number, sourceDocumentId: number, e: DraftEntry) {
  return {
    versionId,
    sourceDocumentId,
    codeSystem: e.codeSystem,
    rawCode: e.rawCode,
    codeNorm: e.codeNorm,
    matchKind: e.matchKind,
    rangeEndNorm: e.rangeEndNorm,
    includesChildren: e.includesChildren,
    descriptionPublished: e.descriptionPublished,
    stateCategory: e.stateCategory,
    stateSubcategory: e.stateSubcategory,
    tier: e.tier === '' ? null : e.tier,
    attributesJson: JSON.stringify(e.attributes),
    qualification: e.qualification,
    qualificationBasis: e.qualificationBasis,
    sourceLocator: e.sourceLocator,
  }
}

const rowCountUpdate = (db: Db, versionId: number) =>
  db
    .update(datasetVersions)
    .set({
      rowCount: sql`(SELECT count(*) FROM entries WHERE version_id = ${versionId})`,
      // Rows changed: the stored report no longer describes them.
      checkReportJson: null,
    })
    .where(and(eq(datasetVersions.id, versionId), eq(datasetVersions.status, 'draft')))

export const draftsRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = draftListQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid query' }, 400)
    const items = await createDb(c.env.DB)
      .select(summaryColumns)
      .from(datasetVersions)
      .where(
        and(eq(datasetVersions.stateId, query.data.stateId), eq(datasetVersions.status, 'draft')),
      )
      .orderBy(desc(datasetVersions.versionNo))
    return c.json(draftListResponseSchema.parse({ items }))
  })

  .post('/', async (c) => {
    const body = draftCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid draft' }, 400)
    const { stateId, label } = body.data
    const db = createDb(c.env.DB)
    const [state] = await db.select({ id: states.id }).from(states).where(eq(states.id, stateId))
    if (!state) return c.json({ error: 'Unknown state' }, 400)
    const [last] = await db
      .select({ n: max(datasetVersions.versionNo) })
      .from(datasetVersions)
      .where(eq(datasetVersions.stateId, stateId))
    const [created] = await db
      .insert(datasetVersions)
      .values({
        stateId,
        versionNo: (last?.n ?? 0) + 1,
        status: 'draft',
        label: label === '' ? null : label,
        createdBy: actorOf(c),
      })
      .returning(summaryColumns)
    if (!created) return c.json({ error: 'Could not create the draft' }, 500)
    await auditInsert(db, {
      actorEmail: actorOf(c),
      action: 'draft.create',
      target: `version:${String(created.id)}`,
      details: { stateId, versionNo: created.versionNo },
    })
    return c.json({ item: draftSummarySchema.parse(created) }, 201)
  })

  .get('/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'Not found' }, 404)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    return c.json(
      draftDetailSchema.parse({
        ...draftSummarySchema.parse(version),
        sources: await sourcesOf(db, version.id),
      }),
    )
  })

  // Adds a source to the draft, or starts it over: its entries are deleted.
  .put('/:id/sources/:sourceId', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    const sourceId = idParam.safeParse(c.req.param('sourceId'))
    if (!id.success || !sourceId.success) return c.json({ error: 'Not found' }, 404)
    const body = draftSourceSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid source' }, 400)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    if (version.status !== 'draft') return c.json({ error: 'Only a draft can change' }, 409)
    const [doc] = await db
      .select({ stateId: sourceDocuments.stateId, title: sourceDocuments.title })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, sourceId.data))
    if (doc?.stateId !== version.stateId) {
      return c.json({ error: 'That source document is not stored for this state' }, 400)
    }
    const values = {
      expectedEntries: body.data.expectedEntries,
      invalidRowCount: body.data.invalidRowCount,
      namedStateIdsJson: JSON.stringify(body.data.namedStateIds),
    }
    await db.batch([
      db
        .delete(entries)
        .where(and(eq(entries.versionId, version.id), eq(entries.sourceDocumentId, sourceId.data))),
      db
        .insert(versionSources)
        .values({ versionId: version.id, sourceDocumentId: sourceId.data, ...values })
        .onConflictDoUpdate({
          target: [versionSources.versionId, versionSources.sourceDocumentId],
          set: values,
        }),
      rowCountUpdate(db, version.id),
      auditInsert(db, {
        actorEmail: actorOf(c),
        action: 'draft.source',
        target: `version:${String(version.id)}`,
        details: { sourceDocumentId: sourceId.data, title: doc.title, ...body.data },
      }),
    ])
    return c.json({ ok: true })
  })

  .post('/:id/rows', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'Not found' }, 404)
    const body = draftRowsRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid rows' }, 400)
    const { sourceDocumentId, entries: sent } = body.data
    for (const [index, e] of sent.entries()) {
      const problem = validateDraftEntry(e)
      if (problem) return c.json({ error: problem, index }, 400)
    }
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    if (version.status !== 'draft') return c.json({ error: 'Only a draft can change' }, 409)
    const [link] = await db
      .select({ expected: versionSources.expectedEntries })
      .from(versionSources)
      .where(
        and(
          eq(versionSources.versionId, version.id),
          eq(versionSources.sourceDocumentId, sourceDocumentId),
        ),
      )
    if (!link) return c.json({ error: 'Add the source to the draft first' }, 400)
    const [stored] = await db
      .select({ n: count() })
      .from(entries)
      .where(and(eq(entries.versionId, version.id), eq(entries.sourceDocumentId, sourceDocumentId)))
    if ((stored?.n ?? 0) + sent.length > link.expected) {
      return c.json({ error: 'More rows than the source announced; send the source again' }, 400)
    }

    const rows = sent.map((e) => entryRow(version.id, sourceDocumentId, e))
    const inserts = []
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      inserts.push(db.insert(entries).values(rows.slice(i, i + ROWS_PER_INSERT)))
    }
    const [first, ...rest] = inserts
    if (first) await db.batch([first, ...rest, rowCountUpdate(db, version.id)])
    return c.json({ ok: true, stored: (stored?.n ?? 0) + sent.length })
  })

  // Runs the checks and stores the report with the rows' token (publish needs it: step 8).
  .get('/:id/checks', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'Not found' }, 404)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)

    const [state] = await db
      .select({ publishedVersionId: states.publishedVersionId })
      .from(states)
      .where(eq(states.id, version.stateId))
    const publishedId = state?.publishedVersionId ?? null
    const draftEntries = await checkEntries(db, version.id)
    const sources = await sourcesOf(db, version.id)
    const published =
      publishedId === null
        ? null
        : {
            entries: await checkEntries(db, publishedId),
            sourceSha256s: (await sourcesOf(db, publishedId)).map((s) => s.sha256),
          }
    const icd = draftEntries
      .filter((e) => e.codeSystem === 'icd10cm')
      .flatMap((e) => (e.rangeEndNorm ? [e.codeNorm, e.rangeEndNorm] : [e.codeNorm]))

    const report = runChecks({
      stateId: version.stateId,
      draft: {
        entries: draftEntries,
        invalidRowCount: sources.reduce((sum, s) => sum + s.invalidRowCount, 0),
        incompleteSources: sources
          .filter((s) => s.storedEntries !== s.expectedEntries)
          .map((s) => s.title),
        sourceSha256s: sources.map((s) => s.sha256),
        namedStateIds: [...new Set(sources.flatMap((s) => s.namedStateIds))],
      },
      published,
      knownIcd10cm: await knownIcd10cm(db, icd),
    })
    const result = draftChecksResponseSchema.parse({
      report,
      token: await draftToken(db, version.id),
      ranAt: new Date().toISOString(),
      hasPublished: published !== null,
    })
    if (version.status === 'draft') {
      await db
        .update(datasetVersions)
        .set({ checkReportJson: JSON.stringify(result) })
        .where(and(eq(datasetVersions.id, version.id), eq(datasetVersions.status, 'draft')))
    }
    return c.json(result)
  })

  .post('/:id/discard', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'Not found' }, 404)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    if (version.status !== 'draft') return c.json({ error: 'Only a draft can be discarded' }, 409)
    await db.batch([
      db
        .update(datasetVersions)
        .set({ status: 'discarded' })
        .where(and(eq(datasetVersions.id, version.id), eq(datasetVersions.status, 'draft'))),
      auditInsert(db, {
        actorEmail: actorOf(c),
        action: 'draft.discard',
        target: `version:${String(version.id)}`,
        details: { stateId: version.stateId, versionNo: version.versionNo },
      }),
    ])
    return c.json({ ok: true })
  })
