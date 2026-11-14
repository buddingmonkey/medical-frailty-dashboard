import {
  idParamSchema,
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
  runChecks,
  sha256Hex,
  decodeStateFederal,
  encodeStateFederal,
  validateDraftEntry,
  verifyConfirmations,
} from '@mfcd/shared'
import { and, asc, count, desc, eq, inArray, min, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { type AuditRecord, auditInsert } from '../../db/audit'
import { backupVersion } from '../../db/backup'
import { suggestAfterPublish } from '../../db/federal-suggestions'
import { recomputePlacements } from '../../db/placement'
import { recomputeSimilarity } from '../../db/similarity'
import { createDb, type Db } from '../../db/client'
import { chunk, D1_MAX_PARAMS, rowsPerInsert } from '../../db/d1-limits'
import {
  appMeta,
  auditLog,
  categoryMappings,
  datasetVersions,
  draftParts,
  entries,
  refCodes,
  sourceDocuments,
  states,
  versionSources,
} from '../../db/schema'
import { recomputeAfterSave } from '../../middleware/errors'
import type { AppEnv } from '../../types'
import { actorOf, notFound } from './request'

// Draft versions (docs/ingestion.md, steps 6 and 7). Mounted behind requireAdmin and
// adminWriteGuard. Every write is limited to one draft (`version_id`) whose status is 'draft':
// published and superseded versions are never changed here.

/** Codes per ref_codes lookup: D1 binds at most 100 parameters, and the code system is one. */
const LOOKUP_CHUNK = D1_MAX_PARAMS - 1

const idParam = idParamSchema

/** Matches the version only while it is still a draft: one row, or none once published. */
const isDraft = (versionId: number) =>
  and(eq(datasetVersions.id, versionId), eq(datasetVersions.status, 'draft'))

/** `bumpDataVersion` for a batch, applied only while the version is still a draft. */
function bumpDataVersionWhileDraft(db: Db, versionId: number) {
  return db
    .insert(appMeta)
    .select(
      db
        .select({
          key: sql<string>`'data_version'`.as('key'),
          value: sql<string>`'1'`.as('value'),
        })
        .from(datasetVersions)
        .where(isDraft(versionId)),
    )
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: sql`CAST(CAST(${appMeta.value} AS INTEGER) + 1 AS TEXT)` },
    })
}

/**
 * `auditInsert` for a batch, written only while the version is still a draft. Drizzle's
 * insert-select needs every column in table order: `id` NULL takes the next rowid, and `at`
 * repeats the column default.
 */
function auditInsertWhileDraft(db: Db, versionId: number, record: AuditRecord) {
  return db.insert(auditLog).select(
    db
      .select({
        id: sql<number>`NULL`.as('id'),
        at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.as('at'),
        actorEmail: sql<string>`${record.actorEmail}`.as('actor_email'),
        action: sql<string>`${record.action}`.as('action'),
        target: sql<string>`${record.target}`.as('target'),
        detailsJson: sql<string | null>`${
          record.details === undefined ? null : JSON.stringify(record.details)
        }`.as('details_json'),
      })
      .from(datasetVersions)
      .where(isDraft(versionId)),
  )
}

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
      stateFederalCategories: entries.stateFederalCategories,
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
      stateFederalCategories: decodeStateFederal(r.stateFederalCategories),
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
  const [first, ...rest] = chunk(unique, LOOKUP_CHUNK).map(select)
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
    stateFederalCategories: encodeStateFederal(e.stateFederalCategories),
  }
}

const rowCountUpdate = (db: Db, versionId: number) =>
  db
    .update(datasetVersions)
    .set({
      rowCount: sql`(SELECT count(*) FROM entries WHERE version_id = ${versionId})`,
      // Rows changed: the stored report no longer describes them.
      checkReportJson: null,
      updatedAt: new Date().toISOString(),
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
    const { stateId, label, fromBackup } = body.data
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
    // Restore path 2: "draft created from backup <file date>, state X, version N".
    await auditInsert(db, {
      actorEmail: actorOf(c),
      action: fromBackup ? 'draft.restore' : 'draft.create',
      target: `version:${String(created.id)}`,
      details: fromBackup
        ? {
            stateId,
            versionNo: created.versionNo,
            backupWrittenAt: fromBackup.writtenAt,
            backupEnvironment: fromBackup.environment,
            backupFormat: fromBackup.format,
            backupVersionNo: fromBackup.versionNo,
          }
        : { stateId, versionNo: created.versionNo },
    })
    return c.json({ item: draftSummarySchema.parse(created) }, 201)
  })

  .get('/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)
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
    if (!id.success || !sourceId.success) return notFound(c)
    const body = draftSourceSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid source' }, 400)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)
    if (version.status !== 'draft')
      return c.json(
        {
          error:
            'This version is no longer a draft, so it cannot change. Send the rows to a new draft.',
        },
        409,
      )
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
    if (!id.success) return notFound(c)
    const body = draftRowsRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid rows' }, 400)
    const { sourceDocumentId, part, entries: sent } = body.data
    for (const [index, e] of sent.entries()) {
      const problem = validateDraftEntry(e)
      if (problem) return c.json({ error: problem, index }, 400)
    }
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)
    if (version.status !== 'draft')
      return c.json(
        {
          error:
            'This version is no longer a draft, so it cannot change. Send the rows to a new draft.',
        },
        409,
      )
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
      return c.json(
        { error: 'More rows arrived than expected. Send the table to the draft again.' },
        400,
      )
    }

    const rows = sent.map((e) => entryRow(version.id, sourceDocumentId, part, e))
    const [first, ...rest] = chunk(rows, rowsPerInsert(rows)).map((part) =>
      db.insert(entries).values(part),
    )
    if (first) await db.batch([first, ...rest, rowCountUpdate(db, version.id)])
    return c.json({ ok: true, stored: (stored?.n ?? 0) + sent.length })
  })

  // Runs the checks and stores the report with the rows' token (publish needs it: step 8).
  .get('/:id/checks', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)

    const result = await runDraftChecks(db, version)
    if (version.status === 'draft') {
      await db
        .update(datasetVersions)
        .set({ checkReportJson: JSON.stringify(result), updatedAt: new Date().toISOString() })
        .where(and(eq(datasetVersions.id, version.id), eq(datasetVersions.status, 'draft')))
    }
    return c.json(result)
  })

  // Publish (docs/data-model.md, "Replacing a state's list"): only what was checked, with every
  // confirmation the checks ask for; a backup of the replaced version first; then one batch,
  // every statement limited to this state or this version.
  .post('/:id/publish', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const body = publishRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)
    if (version.status !== 'draft')
      return c.json(
        {
          error:
            'This version is no longer a draft: it was already published or discarded. Reload the page.',
        },
        409,
      )

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
    // Every statement runs only while the version is still a draft, and the statement that
    // publishes it comes last: of two requests that both passed the draft check above (a double
    // submit), the second batch changes nothing and gets a 409.
    const stillDraft = sql`(SELECT status FROM dataset_versions WHERE id = ${version.id}) = 'draft'`
    const results = await db.batch([
      db
        .delete(entries)
        .where(and(eq(entries.versionId, version.id), notInArray(entries.id, firsts), stillDraft)),
      db
        .update(datasetVersions)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(datasetVersions.stateId, stateId),
            eq(datasetVersions.status, 'published'),
            stillDraft,
          ),
        ),
      db
        .update(states)
        .set({ publishedVersionId: version.id, status: 'published', updatedAt: now })
        .where(and(eq(states.id, stateId), stillDraft)),
      ...autoMappings,
      bumpDataVersionWhileDraft(db, version.id),
      auditInsertWhileDraft(db, version.id, {
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
        )
        .returning({ id: datasetVersions.id }),
    ])
    const published = results.at(-1)
    if (!Array.isArray(published) || published.length !== 1) {
      return c.json(
        {
          error:
            'This version is no longer a draft: it was already published or discarded. Reload the page.',
        },
        409,
      )
    }
    // Right after the batch: where the new list counts among the unified categories, its
    // suggestions by code (reviews carried over from the version it replaced; publishing a
    // reference state does not re-run other states), then how alike its list is to every other
    // state's (roadmap M5 step 7). The publish stands if this fails: the answer carries a
    // warning instead.
    const recomputed = await recomputeAfterSave(c, async () => {
      await recomputePlacements(db, { stateIds: [stateId] })
      await suggestAfterPublish(db, stateId, previous)
      await recomputeSimilarity(db, { stateIds: [stateId] })
    })
    return c.json(publishResponseSchema.parse({ ok: true, backupKey, ...recomputed }))
  })

  .post('/:id/discard', async (c) => {
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const db = createDb(c.env.DB)
    const version = await findVersion(db, id.data)
    if (!version) return notFound(c)
    if (version.status !== 'draft')
      return c.json(
        {
          error:
            'This version is no longer a draft: it was already published or discarded. Reload the page.',
        },
        409,
      )
    await db.batch([
      db
        .update(datasetVersions)
        .set({ status: 'discarded', updatedAt: new Date().toISOString() })
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
