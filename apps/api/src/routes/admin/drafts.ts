import {
  autoMapCategory,
  type CheckEntry,
  type DraftChecksResponse,
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
  publishRequestSchema,
  publishResponseSchema,
  namedStateIdsSchema,
  routeIdSchema,
  runChecks,
  sha256Hex,
  validateDraftEntry,
  verifyConfirmations,
} from '@mfcd/shared'
import { and, asc, count, desc, eq, inArray, min, notInArray, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { backupVersion } from '../../db/backup'
import { bumpDataVersion } from '../../db/meta'
import { recomputePlacements } from '../../db/placement'
import { createDb, type Db } from '../../db/client'
import {
  categoryMappings,
  datasetVersions,
  draftParts,
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

/** D1 binds at most 100 parameters per statement. */
const D1_MAX_PARAMS = 100
/** Codes per ref_codes lookup: D1 binds at most 100 parameters, and the code system is one. */
const LOOKUP_CHUNK = 99

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
      tier: entries.tier,
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
      tier: r.tier ?? '',
      descriptionPublished: r.descriptionPublished,
      included: attributes.success ? attributes.data.included : true,
      unresolvedFlags: attributes.success ? attributes.data.flags : [],
    }
  })
}

/** Each part (table or sheet) sent to a draft, with how many of its entries arrived. */
async function partsOf(db: Db, versionId: number) {
  const rows = await db
    .select({
      sourceDocumentId: draftParts.sourceDocumentId,
      part: draftParts.part,
      title: sourceDocuments.title,
      sha256: sourceDocuments.sha256,
      expectedEntries: draftParts.expectedEntries,
      invalidRowCount: draftParts.invalidRowCount,
      namedStateIdsJson: draftParts.namedStateIdsJson,
    })
    .from(draftParts)
    .innerJoin(sourceDocuments, eq(draftParts.sourceDocumentId, sourceDocuments.id))
    .where(eq(draftParts.versionId, versionId))
    .orderBy(asc(draftParts.sourceDocumentId), asc(draftParts.part))
  const stored = await db
    .select({ sourceDocumentId: entries.sourceDocumentId, part: entries.sourcePart, n: count() })
    .from(entries)
    .where(eq(entries.versionId, versionId))
    .groupBy(entries.sourceDocumentId, entries.sourcePart)
  const storedBy = new Map(stored.map((s) => [`${String(s.sourceDocumentId)}|${s.part}`, s.n]))
  return rows.map(({ namedStateIdsJson, ...r }) => ({
    ...r,
    storedEntries: storedBy.get(`${String(r.sourceDocumentId)}|${r.part}`) ?? 0,
    namedStateIds: namedStateIdsSchema.parse(JSON.parse(namedStateIdsJson)),
  }))
}

/** SHA-256 of every source file linked to a version. */
async function sourceHashes(db: Db, versionId: number): Promise<string[]> {
  const rows = await db
    .select({ sha256: sourceDocuments.sha256 })
    .from(versionSources)
    .innerJoin(sourceDocuments, eq(versionSources.sourceDocumentId, sourceDocuments.id))
    .where(eq(versionSources.versionId, versionId))
  return rows.map((r) => r.sha256)
}

/** The rows' fingerprint: changes whenever an entry or a source of the draft changes. */
async function draftToken(db: Db, versionId: number): Promise<string> {
  const ids = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.versionId, versionId))
    .orderBy(asc(entries.id))
  const parts = await db
    .select()
    .from(draftParts)
    .where(eq(draftParts.versionId, versionId))
    .orderBy(asc(draftParts.sourceDocumentId), asc(draftParts.part))
  const text = JSON.stringify({ versionId, ids: ids.map((r) => r.id), parts })
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

function entryRow(versionId: number, sourceDocumentId: number, part: string, e: DraftEntry) {
  return {
    versionId,
    sourceDocumentId,
    sourcePart: part,
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

type Version = NonNullable<Awaited<ReturnType<typeof findVersion>>>

/** The checks report for a draft, with the token of its rows (docs/ingestion.md). */
async function runDraftChecks(db: Db, version: Version): Promise<DraftChecksResponse> {
  const [state] = await db
    .select({ publishedVersionId: states.publishedVersionId })
    .from(states)
    .where(eq(states.id, version.stateId))
  const publishedId = state?.publishedVersionId ?? null
  const draftEntries = await checkEntries(db, version.id)
  const parts = await partsOf(db, version.id)
  const published =
    publishedId === null
      ? null
      : {
          entries: await checkEntries(db, publishedId),
          sourceSha256s: await sourceHashes(db, publishedId),
        }
  const icd = draftEntries
    .filter((e) => e.codeSystem === 'icd10cm')
    .flatMap((e) => (e.rangeEndNorm ? [e.codeNorm, e.rangeEndNorm] : [e.codeNorm]))

  const report = runChecks({
    stateId: version.stateId,
    draft: {
      entries: draftEntries,
      invalidRowCount: parts.reduce((sum, p) => sum + p.invalidRowCount, 0),
      incompleteSources: parts
        .filter((p) => p.storedEntries !== p.expectedEntries)
        .map((p) => `${p.title} (${p.part})`),
      sourceSha256s: await sourceHashes(db, version.id),
      namedStateIds: [...new Set(parts.flatMap((p) => p.namedStateIds))],
    },
    published,
    knownIcd10cm: await knownIcd10cm(db, icd),
  })
  return draftChecksResponseSchema.parse({
    report,
    token: await draftToken(db, version.id),
    ranAt: new Date().toISOString(),
    hasPublished: published !== null,
  })
}

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
    const [created] = await db
      .insert(datasetVersions)
      .values({
        stateId,
        // One statement, so two drafts created at once cannot get the same number.
        versionNo: sql`(SELECT coalesce(max(version_no), 0) + 1 FROM dataset_versions WHERE state_id = ${stateId})`,
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
        parts: await partsOf(db, version.id),
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
    const { part } = body.data
    const values = {
      expectedEntries: body.data.expectedEntries,
      invalidRowCount: body.data.invalidRowCount,
      namedStateIdsJson: JSON.stringify(body.data.namedStateIds),
    }
    await db.batch([
      db
        .delete(entries)
        .where(
          and(
            eq(entries.versionId, version.id),
            eq(entries.sourceDocumentId, sourceId.data),
            eq(entries.sourcePart, part),
          ),
        ),
      db
        .insert(versionSources)
        .values({ versionId: version.id, sourceDocumentId: sourceId.data })
        .onConflictDoNothing(),
      db
        .insert(draftParts)
        .values({ versionId: version.id, sourceDocumentId: sourceId.data, part, ...values })
        .onConflictDoUpdate({
          target: [draftParts.versionId, draftParts.sourceDocumentId, draftParts.part],
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
    const { sourceDocumentId, part, entries: sent } = body.data
    for (const [index, e] of sent.entries()) {
      const problem = validateDraftEntry(e)
      if (problem) return c.json({ error: problem, index }, 400)
    }
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    if (version.status !== 'draft') return c.json({ error: 'Only a draft can change' }, 409)
    const [link] = await db
      .select({ expected: draftParts.expectedEntries })
      .from(draftParts)
      .where(
        and(
          eq(draftParts.versionId, version.id),
          eq(draftParts.sourceDocumentId, sourceDocumentId),
          eq(draftParts.part, part),
        ),
      )
    if (!link) return c.json({ error: 'Add the source to the draft first' }, 400)
    const [stored] = await db
      .select({ n: count() })
      .from(entries)
      .where(
        and(
          eq(entries.versionId, version.id),
          eq(entries.sourceDocumentId, sourceDocumentId),
          eq(entries.sourcePart, part),
        ),
      )
    if ((stored?.n ?? 0) + sent.length > link.expected) {
      return c.json({ error: 'More rows than the source announced; send the source again' }, 400)
    }

    const rows = sent.map((e) => entryRow(version.id, sourceDocumentId, part, e))
    // Every column of a row is one parameter; adding a column must not break the limit.
    const perInsert = Math.floor(D1_MAX_PARAMS / Object.keys(rows[0] ?? { x: 0 }).length)
    const inserts = []
    for (let i = 0; i < rows.length; i += perInsert) {
      inserts.push(db.insert(entries).values(rows.slice(i, i + perInsert)))
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

    const result = await runDraftChecks(db, version)
    if (version.status === 'draft') {
      await db
        .update(datasetVersions)
        .set({ checkReportJson: JSON.stringify(result) })
        .where(and(eq(datasetVersions.id, version.id), eq(datasetVersions.status, 'draft')))
    }
    return c.json(result)
  })

  // Publish (docs/data-model.md, "Replacing a state's list"): only what was checked, with every
  // confirmation the checks ask for; a backup of the replaced version first; then one batch,
  // every statement limited to this state or this version.
  .post('/:id/publish', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'Not found' }, 404)
    const body = publishRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return c.json({ error: 'Not found' }, 404)
    if (version.status !== 'draft') return c.json({ error: 'Only a draft can be published' }, 409)

    const checks = await runDraftChecks(db, version)
    if (checks.token !== body.data.token) {
      return c.json({ error: 'The rows changed since the checks ran. Run the checks again.' }, 409)
    }
    const verdict = verifyConfirmations(checks.report, version.stateId, body.data.confirmations)
    if (!verdict.ok) {
      return c.json({ error: 'Some checks are not confirmed', missing: verdict.missing }, 400)
    }

    const stateId = version.stateId
    const [state] = await db
      .select({ publishedVersionId: states.publishedVersionId })
      .from(states)
      .where(eq(states.id, stateId))
    const previous = state?.publishedVersionId ?? null
    const backupKey =
      previous === null ? null : await backupVersion(db, c.env.FILES, stateId, previous)
    const now = new Date().toISOString()
    const actor = actorOf(c)

    // New state categories get the keyword table's guess, stored as "auto" until an admin
    // confirms it (docs/ingestion.md, "Category auto-mapping"). Existing mappings stay.
    const used = await db
      .selectDistinct({ category: entries.stateCategory, subcategory: entries.stateSubcategory })
      .from(entries)
      .where(eq(entries.versionId, version.id))
    const autoMappings = used.flatMap(({ category, subcategory }) => {
      const auto = autoMapCategory(category, subcategory)
      return auto
        ? [
            db
              .insert(categoryMappings)
              .values({
                stateId,
                stateCategory: category,
                stateSubcategory: subcategory,
                federalCategory: auto.federalCategory,
                method: 'auto' as const,
                confidence: auto.confidence,
              })
              .onConflictDoNothing(),
          ]
        : []
    })

    // Duplicates (same code, category, subcategory and tier): keep the first.
    const firsts = db
      .select({ id: min(entries.id) })
      .from(entries)
      .where(eq(entries.versionId, version.id))
      .groupBy(
        entries.codeSystem,
        entries.matchKind,
        entries.codeNorm,
        sql`coalesce(${entries.rangeEndNorm}, '')`,
        entries.stateCategory,
        entries.stateSubcategory,
        sql`coalesce(${entries.tier}, '')`,
      )
    await db.batch([
      db
        .delete(entries)
        .where(and(eq(entries.versionId, version.id), notInArray(entries.id, firsts))),
      db
        .update(datasetVersions)
        .set({ status: 'superseded' })
        .where(and(eq(datasetVersions.stateId, stateId), eq(datasetVersions.status, 'published'))),
      db
        .update(datasetVersions)
        .set({
          status: 'published',
          publishedBy: actor,
          publishedAt: now,
          contentUpdatedAt: now,
          checkReportJson: JSON.stringify(checks),
          rowCount: sql`(SELECT count(*) FROM entries WHERE version_id = ${version.id})`,
        })
        .where(
          and(
            eq(datasetVersions.id, version.id),
            eq(datasetVersions.stateId, stateId),
            eq(datasetVersions.status, 'draft'),
          ),
        ),
      db
        .update(states)
        .set({ publishedVersionId: version.id, status: 'published', updatedAt: now })
        .where(eq(states.id, stateId)),
      ...autoMappings,
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actor,
        action: 'version.publish',
        target: `version:${String(version.id)}`,
        details: {
          stateId,
          versionNo: version.versionNo,
          replaced: previous,
          backupKey,
          confirmed: Object.keys(body.data.confirmations),
          diff: checks.report.diff.totals,
        },
      }),
    ])
    // Right after the batch: where the new list counts among the unified categories.
    await recomputePlacements(db, { stateIds: [stateId] })
    return c.json(publishResponseSchema.parse({ ok: true, backupKey }))
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
