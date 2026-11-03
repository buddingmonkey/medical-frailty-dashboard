// Code search (roadmap M6 step 1; docs/architecture.md, `/api/public/codes/search`). The query
// schema, the code-or-words reading of the input, and the FTS5 MATCH expression. Pure
// functions, no I/O. Every check here is a linear scan or an anchored regex without nested
// quantifiers, so no input can make it backtrack.
import { z } from 'zod'

import { inferCodeSystem } from './codes'
import { type CodeSystem, codeSystemSchema } from './enums'

export const CODE_SEARCH_MAX_Q = 100
export const CODE_SEARCH_DEFAULT_LIMIT = 20
export const CODE_SEARCH_MAX_LIMIT = 50
/** Words past this many are dropped: each one is another term the FTS index must merge. */
export const CODE_SEARCH_MAX_TOKENS = 8

const SLUG = /^[a-z]{2}$/

/** `ga, MT,ga` → `['ga', 'mt']`; null when a part is not a state slug. */
function slugList(value: string): string[] | null {
  const slugs: string[] = []
  for (const part of value.split(',')) {
    const slug = part.trim().toLowerCase()
    if (slug === '') continue
    if (!SLUG.test(slug)) return null
    if (!slugs.includes(slug)) slugs.push(slug)
  }
  return slugs
}

export const codeSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(CODE_SEARCH_MAX_Q),
  /** A comma list of state slugs (`ga,mt`): only codes those states list. */
  states: z
    .string()
    .max(51 * 4)
    .optional()
    .transform((value, ctx) => {
      const slugs = slugList(value ?? '')
      if (slugs) return slugs
      ctx.addIssue({ code: 'custom', message: 'states: a comma list of state slugs' })
      return z.NEVER
    }),
  system: codeSystemSchema.nullish().transform((s) => s ?? null),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CODE_SEARCH_MAX_LIMIT)
    .default(CODE_SEARCH_DEFAULT_LIMIT),
})
export type CodeSearchQuery = z.infer<typeof codeSearchQuerySchema>

// ---------------------------------------------------------------------------------------------
// Code or words?

export type SearchInput =
  /**
   * A code or the start of one (`F20`, `f20.0`, `J1234`, `99213`), as `normalizeCode` writes
   * it. `systems` null: any code system; `['icd10cm']` for the dotted form. `primary` is the
   * system `inferCodeSystem` reads, which sorts first among equal codes.
   */
  | { kind: 'code'; prefix: string; systems: CodeSystem[] | null; primary: CodeSystem | null }
  | { kind: 'words'; tokens: string[] }

/** Longest code with a dot: `S14.111A`. */
const MAX_CODE_TEXT = 8
/** ICD-10-CM written with its dot, maybe unfinished: `F20.`, `F20.0`, `S14.111A`. */
const ICD_DOTTED_PREFIX = /^(?:[A-Z]\d|QA)[0-9A-Z]\.[0-9A-Z]{0,4}$/
/** The start of an ICD-10-CM code without its dot: `F2`, `F20`, `F2081`. */
const ICD_PREFIX = /^(?:[A-Z]\d|QA)[0-9A-Z]{0,5}$/
/** The start of a HCPCS Level II code: `J1`, `J1234`. */
const HCPCS_PREFIX = /^[A-V]\d{1,4}$/
/** The start of a CPT or revenue code: digits, or CPT Category II/III and PLA (`0001F`). */
const NUMERIC_PREFIX = /^(?:\d{1,5}|\d{4}[FTU])$/

/** Reads the search box: a code prefix when the text has a code's shape, otherwise words. */
export function parseSearchInput(q: string): SearchInput {
  const text = q.trim().toUpperCase()
  if (text.length <= MAX_CODE_TEXT && hasDigit(text)) {
    if (ICD_DOTTED_PREFIX.test(text)) {
      const prefix = text.replace('.', '')
      return { kind: 'code', prefix, systems: ['icd10cm'], primary: 'icd10cm' }
    }
    if (ICD_PREFIX.test(text) || HCPCS_PREFIX.test(text) || NUMERIC_PREFIX.test(text)) {
      return { kind: 'code', prefix: text, systems: null, primary: primarySystem(text) }
    }
  }
  return { kind: 'words', tokens: searchTokens(q) }
}

function hasDigit(text: string): boolean {
  for (const ch of text) if (ch >= '0' && ch <= '9') return true
  return false
}

/** `inferCodeSystem` for a whole code; a shorter prefix by its shape. */
function primarySystem(text: string): CodeSystem | null {
  const inferred = inferCodeSystem(text).system
  if (inferred) return inferred
  if (ICD_PREFIX.test(text)) return 'icd10cm'
  if (HCPCS_PREFIX.test(text)) return 'hcpcs'
  return NUMERIC_PREFIX.test(text) ? 'cpt' : null
}

// ---------------------------------------------------------------------------------------------
// Words → FTS5

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u

/**
 * The words of the input, lowercased, like FTS5's unicode61 tokenizer reads them: runs of
 * letters, digits and combining marks. Everything else (quotes, `*`, `:`, `-`, parentheses)
 * only separates words, so no FTS syntax survives. At most CODE_SEARCH_MAX_TOKENS words.
 */
export function searchTokens(q: string): string[] {
  const tokens: string[] = []
  let current = ''
  for (const ch of q.toLowerCase()) {
    if (WORD_CHAR.test(ch)) {
      current += ch
      continue
    }
    if (current !== '') tokens.push(current)
    current = ''
    if (tokens.length >= CODE_SEARCH_MAX_TOKENS) return tokens
  }
  if (current !== '' && tokens.length < CODE_SEARCH_MAX_TOKENS) tokens.push(current)
  return tokens
}

/**
 * `description : ("paranoid" "schiz"*)`: every token quoted (so `NEAR`, `OR` and `NOT` are plain
 * words), all of them required, the last one a prefix for type-ahead. A one-character last
 * token stays exact, since its prefix would merge every term with that letter. Null without
 * tokens.
 */
export function ftsMatchExpression(tokens: readonly string[], column: string): string | null {
  if (tokens.length === 0) return null
  const phrases = tokens.map((token, i) => {
    const quoted = `"${token.replaceAll('"', '""')}"`
    return i === tokens.length - 1 && token.length > 1 ? `${quoted}*` : quoted
  })
  return `${column} : (${phrases.join(' ')})`
}

// ---------------------------------------------------------------------------------------------
// Response

export const codeSearchResultSchema = z.object({
  system: codeSystemSchema,
  codeNorm: z.string(),
  /** `formatCode`: `F20.0`. */
  code: z.string(),
  /** The code page (`codeUrlPath`), null for systems without pages. */
  url: z.string().nullable(),
  /** CMS text for ICD-10-CM and HCPCS; otherwise the first listing state's own text. */
  description: z.string().nullable(),
  descriptionSource: z.enum(['cms', 'state']).nullable(),
  /** The state whose published text `description` is, when `descriptionSource` is `state`. */
  descriptionState: z.object({ slug: z.string(), name: z.string() }).nullable(),
  /** Published states that list this exact code (any of their entries with this code_norm). */
  listedBy: z.object({ count: z.number().int().min(0), states: z.array(z.string()) }),
})
export type CodeSearchResult = z.infer<typeof codeSearchResultSchema>

export const codeSearchResponseSchema = z.object({
  query: z.object({
    q: z.string(),
    kind: z.enum(['code', 'words']),
    states: z.array(z.string()),
    system: codeSystemSchema.nullable(),
    limit: z.number().int(),
  }),
  results: z.array(codeSearchResultSchema),
  dataVersion: z.number().int(),
})
export type CodeSearchResponse = z.infer<typeof codeSearchResponseSchema>

/** For a result no state lists (`listedBy.count === 0`). */
export const CODE_SEARCH_NOT_LISTED = 'No state on this site lists this code'
