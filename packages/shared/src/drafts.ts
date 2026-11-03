// Draft versions (docs/ingestion.md, steps 6 and 7): the browser turns reviewed rows into
// entries and sends them in chunks; the API validates each entry again, stores it in a draft,
// and runs the checks. Nothing here touches the published version.
import { z } from 'zod'

import type { CheckId, CheckLevel, CheckReport } from './checks'
import { MAX_CELL_LENGTH, parseCodeCell } from './codes'
import {
  codeSystemSchema,
  matchKinds,
  qualificationBasisSchema,
  qualificationSchema,
  versionStatuses,
} from './enums'
import { MAX_ROWS } from './ingest'
import type { ReviewFlag, ReviewResult } from './review'

/** Entries per `POST /api/admin/drafts/:id/rows`: keeps each request well under Workers CPU limits. */
export const DRAFT_CHUNK = 500

const stateId = z.string().regex(/^[A-Z]{2}$/)
const id = z.number().int().positive()
const text = (max: number) => z.string().max(max)

const reviewFlagSchema = z.enum([
  'category_scope',
  'system_ambiguous',
  'mixed_wildcard_range',
  'multiline_description',
] satisfies ReviewFlag[])

/** Stored as `entries.attributes_json`. */
export const entryAttributesSchema = z.object({
  /** False when the source marks the row as not qualifying (GA "Yes/No" = No). */
  included: z.boolean(),
  /** Review flags nobody answered or accepted. */
  flags: z.array(reviewFlagSchema).max(4),
  notes: text(MAX_CELL_LENGTH).optional(),
  /** The cell the qualification rule read (LA designation `0`). */
  qualificationValue: text(200).optional(),
})
export type EntryAttributes = z.infer<typeof entryAttributesSchema>

export const draftEntrySchema = z.object({
  codeSystem: codeSystemSchema,
  rawCode: text(200).min(1),
  codeNorm: z.string().regex(/^[0-9A-Z]{1,20}$/),
  matchKind: z.enum(matchKinds),
  rangeEndNorm: z
    .string()
    .regex(/^[0-9A-Z]{1,20}$/)
    .nullable(),
  includesChildren: z.union([z.literal(0), z.literal(1)]).nullable(),
  descriptionPublished: text(MAX_CELL_LENGTH).nullable(),
  stateCategory: text(200),
  stateSubcategory: text(200),
  tier: text(200),
  qualification: qualificationSchema,
  qualificationBasis: qualificationBasisSchema,
  sourceLocator: text(200),
  attributes: entryAttributesSchema,
})
export type DraftEntry = z.infer<typeof draftEntrySchema>

/** A numeric id in a route (`/drafts/:id`). */
export const routeIdSchema = z.coerce.number().int().positive()

/** Query of `GET /api/admin/drafts`. */
export const draftListQuerySchema = z.object({ stateId })

/** `draft_parts.named_state_ids_json`; anything unreadable counts as no names. */
export const namedStateIdsSchema = z.array(z.string()).catch([])

/** `fromBackup` of `POST /api/admin/drafts`: the backup a restored draft comes from (audit). */
export const draftFromBackupSchema = z.object({
  writtenAt: z.string().max(40),
  environment: z.string().max(40).nullable(),
  versionNo: z.number().int().positive(),
  format: z.union([z.literal(1), z.literal(2)]),
})
export type DraftFromBackup = z.infer<typeof draftFromBackupSchema>

/** Body of `POST /api/admin/drafts`. */
export const draftCreateSchema = z.object({
  stateId,
  label: z.string().trim().max(200).default(''),
  /** Set by restore path 2 (/admin/restore); the audit row then says which backup. */
  fromBackup: draftFromBackupSchema.optional(),
})

/** A table or sheet of a source file ("Pages 2–294", "Sheet1"). */
const part = z.string().trim().min(1).max(200)

/**
 * Body of `PUT /api/admin/drafts/:id/sources/:sourceId`: adds one part (table or sheet) of a
 * source to the draft, or starts that part over (its entries are deleted). The rows follow in
 * chunks; `expectedEntries` lets the checks see an upload that stopped half way.
 */
export const draftSourceSchema = z.object({
  part,
  expectedEntries: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROWS * 4),
  invalidRowCount: z.number().int().min(0).max(MAX_ROWS),
  namedStateIds: z.array(stateId).max(60),
})
export type DraftSource = z.infer<typeof draftSourceSchema>

/** Body of `POST /api/admin/drafts/:id/rows`. */
export const draftRowsRequestSchema = z.object({
  sourceDocumentId: id,
  part,
  entries: z.array(draftEntrySchema).min(1).max(DRAFT_CHUNK),
})

export const draftSummarySchema = z.object({
  id,
  stateId: z.string(),
  versionNo: z.number().int().positive(),
  status: z.enum(versionStatuses),
  label: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  rowCount: z.number().int().nonnegative(),
})
export type DraftSummary = z.infer<typeof draftSummarySchema>

export const draftListResponseSchema = z.object({ items: z.array(draftSummarySchema) })

export const draftDetailSchema = draftSummarySchema.extend({
  /** One item per part (table or sheet) of each source sent. */
  parts: z.array(
    z.object({
      sourceDocumentId: id,
      part: z.string(),
      title: z.string(),
      sha256: z.string(),
      expectedEntries: z.number().int().nonnegative(),
      storedEntries: z.number().int().nonnegative(),
      invalidRowCount: z.number().int().nonnegative(),
      namedStateIds: z.array(z.string()),
    }),
  ),
})
export type DraftDetail = z.infer<typeof draftDetailSchema>

const checkCountsSchema = z.object({
  added: z.number(),
  removed: z.number(),
  descriptionChanged: z.number(),
  categoryChanged: z.number(),
})

export const checkReportSchema = z.object({
  checks: z.array(
    z.object({
      id: z.string() as z.ZodType<CheckId>,
      level: z.enum(['block', 'confirm', 'confirm_typed', 'info'] satisfies CheckLevel[]),
      triggered: z.boolean(),
      message: z.string(),
      count: z.number().optional(),
    }),
  ),
  canPublish: z.boolean(),
  diff: z.object({
    totals: checkCountsSchema,
    bySystem: z.partialRecord(codeSystemSchema, checkCountsSchema),
    changes: z.array(
      z.object({
        kind: z.enum(['added', 'removed', 'description_changed', 'category_changed']),
        codeSystem: codeSystemSchema,
        code: z.string(),
        before: z.string().nullable(),
        after: z.string().nullable(),
      }),
    ),
  }),
}) satisfies z.ZodType<CheckReport>

/** `GET /api/admin/drafts/:id/checks`. Publish (step 8) needs `token`: it fingerprints the
 * draft's rows, so rows that change after the checks ran cannot be published. */
export const draftChecksResponseSchema = z.object({
  report: checkReportSchema,
  token: z.string(),
  ranAt: z.string(),
  hasPublished: z.boolean(),
})
export type DraftChecksResponse = z.infer<typeof draftChecksResponseSchema>

// ---------------------------------------------------------------------------------------------

/** Reviewed rows → draft entries. Dropped rows are left out; rows that cannot be read count as
 * invalid (the checks block above 2%). */
export function toDraftEntries(review: ReviewResult): {
  entries: DraftEntry[]
  invalidRowCount: number
} {
  const entries: DraftEntry[] = []
  let invalidRowCount = 0
  for (const r of review.rows) {
    if (r.dropped) continue
    if (r.status === 'problem') {
      invalidRowCount++
      continue
    }
    const { row } = r
    const attributes: EntryAttributes = { included: row.included, flags: r.openFlags }
    if (row.notes) attributes.notes = row.notes
    if (row.qualificationValue) attributes.qualificationValue = row.qualificationValue
    for (const code of r.codes) {
      entries.push({
        codeSystem: code.codeSystem,
        rawCode: code.rawCode,
        codeNorm: code.codeNorm,
        matchKind: code.matchKind,
        rangeEndNorm: code.rangeEndNorm,
        includesChildren: code.includesChildren,
        descriptionPublished: row.description === '' ? null : row.description,
        stateCategory: row.category,
        stateSubcategory: row.subcategory,
        tier: row.tier,
        qualification: row.qualification,
        qualificationBasis: row.qualificationBasis,
        sourceLocator: r.key.slice(0, 200),
        attributes,
      })
    }
  }
  return { entries, invalidRowCount }
}

/**
 * The API's second look at an entry: its raw code, read in its code system, must give exactly
 * the code, match kind and range end the browser sent. Returns a message, or null when fine.
 */
export function validateDraftEntry(entry: DraftEntry): string | null {
  const parsed = parseCodeCell(entry.rawCode, { system: entry.codeSystem })
  if (parsed.problems.length > 0) {
    return parsed.codes.length === 0 && parsed.problems.length === 1
      ? `“${entry.rawCode}” is not a code in this code system.`
      : `“${entry.rawCode}” must hold exactly one code.`
  }
  const [code] = parsed.codes
  if (!code || parsed.codes.length !== 1) return `“${entry.rawCode}” must hold exactly one code.`
  if (
    code.codeNorm !== entry.codeNorm ||
    code.matchKind !== entry.matchKind ||
    code.rangeEndNorm !== entry.rangeEndNorm
  ) {
    return `“${entry.rawCode}” does not match the code sent with it.`
  }
  return null
}

/**
 * States whose full name appears in the texts (file name, table names, headers, first rows),
 * for the "file names another state" check. Longer names win, so "West Virginia" is not also
 * Virginia and "Arkansas" is not Kansas.
 */
export function findNamedStates(
  texts: readonly string[],
  states: readonly { id: string; name: string }[],
): string[] {
  const byLength = [...states].sort((a, b) => b.name.length - a.name.length)
  const found = new Set<string>()
  for (const raw of texts) {
    let rest = ` ${raw.slice(0, 2_000).toLowerCase()} `
    for (const state of byLength) {
      const name = state.name.toLowerCase()
      let at = rest.indexOf(name)
      while (at >= 0) {
        const before = rest[at - 1] ?? ' '
        const after = rest[at + name.length] ?? ' '
        if (!isLetter(before) && !isLetter(after)) {
          found.add(state.id)
          // Blank it out so a shorter name inside it ("Virginia") is not found again.
          rest = rest.slice(0, at) + ' '.repeat(name.length) + rest.slice(at + name.length)
        }
        at = rest.indexOf(name, at + 1)
      }
    }
  }
  return states.map((s) => s.id).filter((s) => found.has(s))
}

const isLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase()
