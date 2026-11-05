import { z } from 'zod'

import { stateIdSchema } from './admin'
import { stateStatuses, versionStatuses } from './enums'

// Source documents: the state's original files, stored unchanged in R2 as evidence
// (docs/ingestion.md, step 2; docs/security.md, "Upload safety").

export const sourceFileTypes = ['pdf', 'xlsx', 'csv', 'json', 'txt'] as const
export const sourceFileTypeSchema = z.enum(sourceFileTypes)
export type SourceFileType = z.infer<typeof sourceFileTypeSchema>

/** Largest source file accepted (docs/ingestion.md, "Parser adapters"). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/** The file type from a file name's last extension, or null if we do not parse it. */
export function fileTypeFromName(name: string): SourceFileType | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return sourceFileTypeSchema.safeParse(ext).data ?? null
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // PK\3\4 (xlsx is a zip)
/** PDF readers accept the header anywhere in the first 1,024 bytes. */
const PDF_HEADER_WINDOW = 1024
const TEXT_SNIFF_BYTES = 8192

function startsWithAt(bytes: Uint8Array, magic: number[], at: number): boolean {
  return magic.every((b, i) => bytes[at + i] === b)
}

/** True if the first bytes look like the claimed file type. A cheap check, not a parser. */
export function sniffMatches(bytes: Uint8Array, type: SourceFileType): boolean {
  if (bytes.length === 0) return false
  switch (type) {
    case 'pdf': {
      const last = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_MAGIC.length
      for (let i = 0; i <= last; i++) if (startsWithAt(bytes, PDF_MAGIC, i)) return true
      return false
    }
    case 'xlsx':
      return startsWithAt(bytes, ZIP_MAGIC, 0)
    case 'csv':
    case 'json':
    case 'txt':
      return !bytes.subarray(0, TEXT_SNIFF_BYTES).includes(0)
  }
}

/** Lower-case hex SHA-256. Web Crypto, so the browser and the Worker get the same answer. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

const stateId = stateIdSchema
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
/** A query-string value where blank means "not given". */
const blankToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable())

/**
 * Query of `POST /api/admin/sources` (the body is the raw file). `sha256` is the browser's
 * hash; the Worker hashes the body again and refuses a mismatch.
 */
export const sourceUploadQuerySchema = z.object({
  stateId,
  title: z.string().trim().min(1).max(200),
  fileType: sourceFileTypeSchema,
  sha256,
  /** The state's public URL for the file. Null when unknown (e.g. the LA code list PDF). */
  url: blankToNull(z.url({ protocol: /^https?$/ }).max(2000)),
  /** The date the state put on or published the document. */
  publisherDate: blankToNull(z.iso.date()),
})

export type SourceUploadQuery = z.infer<typeof sourceUploadQuerySchema>

/** Today as `YYYY-MM-DD` in UTC, which is never behind a US state's local date. */
const todayUtc = () => new Date().toISOString().slice(0, 10)

/**
 * Body of `PUT /api/admin/sources/:id`: the details shown on public pages, fixed after upload.
 * The file, its hash and its storage key never change. Every field is required; null clears.
 */
export const sourceDetailsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(200, 'Use at most 200 characters.'),
  url: z
    .url({ protocol: /^https$/, error: 'Enter a full https:// address.' })
    .max(2000, 'Use at most 2,000 characters.')
    .nullable(),
  publisherDate: z.iso
    .date({ error: 'Enter a date as YYYY-MM-DD.' })
    .refine((d) => d <= todayUtc(), 'The date cannot be in the future.')
    .nullable(),
})

export type SourceDetails = z.infer<typeof sourceDetailsSchema>

/** The admin form's inputs for `SourceDetails`: blank means "none" (sent as null). */
export type SourceDetailsDraft = Record<keyof SourceDetails, string>

/** Query of `GET /api/admin/sources`: a state's sources, or the one with this hash. */
export const sourceListQuerySchema = z.object({ stateId, sha256: sha256.optional() })

export const sourceDocumentSchema = z.object({
  id: z.number().int().positive(),
  stateId: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  publisherDate: z.string().nullable(),
  retrievedAt: z.string(),
  fileType: sourceFileTypeSchema,
  sha256: z.string(),
  byteSize: z.number().int().nonnegative(),
  uploadedBy: z.string(),
  /** Versions built from this file, so the duplicate warning can say "as version N". */
  versions: z.array(
    z.object({
      id: z.number().int().positive(),
      versionNo: z.number().int().positive(),
      status: z.enum(versionStatuses),
    }),
  ),
})

export type SourceDocument = z.infer<typeof sourceDocumentSchema>

export const sourceListResponseSchema = z.object({ items: z.array(sourceDocumentSchema) })

/** `duplicate: true` means the same file was already stored for this state; nothing new was written. */
export const sourceUploadResponseSchema = z.object({
  source: sourceDocumentSchema,
  duplicate: z.boolean(),
})

export type SourceUploadResponse = z.infer<typeof sourceUploadResponseSchema>

/** Body of `GET /api/admin/states`. */
export const stateListResponseSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(stateStatuses) })),
})

export type StateListResponse = z.infer<typeof stateListResponseSchema>
