import { z } from 'zod'

import { formatCode, parseCodeCell } from './codes'
import { type CodeSystem, codeSystemSchema, type MatchKind, matchKindSchema } from './enums'
import { unifiedSlugFromLabel } from './unified-admin'

// Condition groups and "like" codes (roadmap M6 step 4; docs/data-model.md, "Like codes").
// There is no official crosswalk from ICD-10 diagnoses to CPT/HCPCS services, so a condition
// group is a small hand-curated list of codes in several code systems that point at one
// condition (a cancer diagnosis, a chemotherapy service, a chemotherapy drug). On a code's page,
// a state that does not list or cover the code but lists a code in another code system in the
// same group gets a "like" match, shown apart from the confirmed matches. The wording at the end
// of this file is provisional and on the legal team's list (docs/legal-review.md, item 11).

// ---------------------------------------------------------------------------------------------
// Members: what codes a member covers

export const conditionGroupStatuses = ['draft', 'published'] as const
export const conditionGroupStatusSchema = z.enum(conditionGroupStatuses)
export type ConditionGroupStatus = z.infer<typeof conditionGroupStatusSchema>

/** Admin words for the status. */
export const conditionGroupStatusLabels: Record<ConditionGroupStatus, string> = {
  draft: 'Draft',
  published: 'Published',
}

/** A member as stored in `condition_members`. */
export interface ConditionMember {
  codeSystem: CodeSystem
  matchKind: MatchKind
  codeNorm: string
  rangeEndNorm: string | null
}

/**
 * Sorts after every code character (codes are uppercase letters and digits), so `F20~` is the
 * last string that starts with `F20`. The SQL in apps/api/src/db/public-code.ts uses the same.
 */
export const CODE_SPAN_END = '~'

/**
 * The codes a member covers, as a closed span of strings. A member always covers the codes
 * under its ends (a group is about a condition, so `F20` means the whole category and
 * `C00-C96` runs through `C96.9`), whatever its match kind.
 */
export function conditionMemberSpan(m: Pick<ConditionMember, 'codeNorm' | 'rangeEndNorm'>) {
  return { lo: m.codeNorm, hi: (m.rangeEndNorm ?? m.codeNorm) + CODE_SPAN_END }
}

/** Does the member cover this code (same code system assumed)? */
export function conditionMemberCovers(
  m: Pick<ConditionMember, 'codeNorm' | 'rangeEndNorm'>,
  codeNorm: string,
): boolean {
  const { lo, hi } = conditionMemberSpan(m)
  return lo <= codeNorm && codeNorm <= hi
}

interface EntrySpanShape {
  matchKind: MatchKind
  codeNorm: string
  rangeEndNorm: string | null
  includesChildren: 0 | 1 | null
}

/** The codes a state entry covers, by `entryCovers` in codes.ts (children only when it says). */
export function entrySpan(e: EntrySpanShape) {
  const wild = e.includesChildren === 1 ? CODE_SPAN_END : ''
  if (e.matchKind === 'range') return { lo: e.codeNorm, hi: (e.rangeEndNorm ?? e.codeNorm) + wild }
  if (e.matchKind === 'prefix') return { lo: e.codeNorm, hi: e.codeNorm + CODE_SPAN_END }
  return { lo: e.codeNorm, hi: e.codeNorm + wild }
}

/** Does the state entry share at least one code with the member (same code system assumed)? */
export function entryInConditionMember(
  e: EntrySpanShape,
  m: Pick<ConditionMember, 'codeNorm' | 'rangeEndNorm'>,
): boolean {
  const a = entrySpan(e)
  const b = conditionMemberSpan(m)
  return a.lo <= b.hi && b.lo <= a.hi
}

// ---------------------------------------------------------------------------------------------
// Members as admins type them

/** One member line in the editor: a code system and the codes as text (`C00-C96`, `F20.*`). */
export const conditionMemberInputSchema = z.object({
  codeSystem: codeSystemSchema,
  text: z.string().trim().min(1).max(200),
})
export type ConditionMemberInput = z.infer<typeof conditionMemberInputSchema>

/**
 * Reads a member line with the ingestion parser (`parseCodeCell`, the code system fixed). A list
 * (`B20, Z21`) gives several members. Anything the parser cannot read is refused with its
 * message.
 */
export function parseConditionMember(
  input: ConditionMemberInput,
): { ok: true; members: ConditionMember[] } | { ok: false; error: string } {
  const cell = parseCodeCell(input.text, { system: input.codeSystem })
  const [problem] = cell.problems
  if (problem) return { ok: false, error: `${problem.raw}: ${problem.message}` }
  const members = cell.codes.map((c) => ({
    codeSystem: c.codeSystem,
    matchKind: c.matchKind,
    codeNorm: c.codeNorm,
    rangeEndNorm: c.rangeEndNorm,
  }))
  const wrong = members.find((m) => m.codeSystem !== input.codeSystem)
  if (wrong) {
    return { ok: false, error: `${input.text}: The code does not fit the code system chosen.` }
  }
  return { ok: true, members }
}

/** A member as editable text that `parseConditionMember` reads back the same. */
export function conditionMemberText(m: ConditionMember): string {
  const start = formatCode(m.codeSystem, m.codeNorm)
  if (m.matchKind === 'prefix') return `${start}.*`
  if (m.matchKind === 'range' && m.rangeEndNorm !== null) {
    return `${start}-${formatCode(m.codeSystem, m.rangeEndNorm)}`
  }
  return start
}

// ---------------------------------------------------------------------------------------------
// Admin API: /api/admin/condition-groups

export const conditionGroupSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** A slug from a group's name: the unified categories' rule. */
export const conditionGroupSlugFromName = unifiedSlugFromLabel

/** Body of `POST /api/admin/condition-groups` and `PUT /api/admin/condition-groups/:id`. */
export const conditionGroupBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Omitted: made from the name on create, kept on edit. */
  slug: conditionGroupSlugSchema.optional(),
  /** What the group means, in a sentence or two. */
  definition: z.string().trim().max(2000).default(''),
  /** Where its codes come from (code set headings, chapters, a state's category). */
  sources: z.string().trim().max(4000).default(''),
  status: conditionGroupStatusSchema.default('draft'),
  /** The whole member list; a save replaces it. */
  members: z.array(conditionMemberInputSchema).max(500),
})
export type ConditionGroupBody = z.infer<typeof conditionGroupBodySchema>

export const conditionMemberSchema = z.object({
  id: z.number().int().positive(),
  codeSystem: codeSystemSchema,
  matchKind: matchKindSchema,
  codeNorm: z.string(),
  rangeEndNorm: z.string().nullable(),
  /** `conditionMemberText`. */
  text: z.string(),
})

export const conditionGroupSchema = z.object({
  id: z.number().int().positive(),
  slug: conditionGroupSlugSchema,
  name: z.string(),
  definition: z.string(),
  sources: z.string(),
  status: conditionGroupStatusSchema,
  updatedBy: z.string(),
  updatedAt: z.string(),
  members: z.array(conditionMemberSchema),
})
export type ConditionGroup = z.infer<typeof conditionGroupSchema>

export const conditionGroupListResponseSchema = z.object({ items: z.array(conditionGroupSchema) })

export const conditionGroupSaveResponseSchema = z.object({
  id: z.number().int().positive(),
  slug: conditionGroupSlugSchema,
  members: z.number().int().min(0),
})

// ---------------------------------------------------------------------------------------------
// Public: like codes on `GET /api/public/codes/:system/:code`

export const conditionGroupRefSchema = z.object({ slug: z.string(), name: z.string() })

/** A state's entry in the group, in another code system. No rule: a like code never counts. */
export const likeCodeEntrySchema = z.object({
  codeSystem: codeSystemSchema,
  rawCode: z.string(),
  /** `displayEntryCode`: `C50.*`, `96401–96549`. */
  display: z.string(),
  /** The state's own published text, or null. */
  description: z.string().nullable(),
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  source: z.object({
    title: z.string(),
    url: z.url({ protocol: /^https?$/ }).nullable(),
    publisherDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    locator: z.string().nullable(),
  }),
})
export type LikeCodeEntry = z.infer<typeof likeCodeEntrySchema>

/** Like codes shown per state and group. More than this are counted, not listed. */
export const LIKE_CODES_PER_GROUP = 5

export const likeCodeMatchSchema = z.object({
  group: conditionGroupRefSchema,
  /** All of the state's entries in the group, in other code systems. */
  total: z.number().int().positive(),
  /** The first `LIKE_CODES_PER_GROUP`, by code system and code. */
  entries: z.array(likeCodeEntrySchema),
})
export type LikeCodeMatch = z.infer<typeof likeCodeMatchSchema>

// ---------------------------------------------------------------------------------------------
// Wording (provisional; legal list)

export const LIKE_CODES = {
  heading: 'Like codes',
  help: 'A like code is a code in another code system that points at the same condition, such as a cancer diagnosis for a chemotherapy service; it does not mean the state lists or counts this code.',
  note: 'These states’ lists do not include this code. Condition groups are a short list this site keeps by hand, not an official crosswalk.',
} as const

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

export const likeCodeGroupsText = (names: readonly string[]): string =>
  `This code is in the condition ${names.length === 1 ? 'group' : 'groups'} ${joinNames(names)}.`

export const likeCodeMoreText = (n: number): string =>
  `and ${String(n)} more ${n === 1 ? 'code' : 'codes'} in this group`
