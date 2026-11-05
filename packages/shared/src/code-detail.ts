import { z } from 'zod'

import { type CompareStatus, compareStatuses, compareStatusLabels } from './compare'
import { conditionGroupRefSchema, likeCodeMatchSchema } from './condition-groups'
import {
  type CodeSystem,
  codeSystemLabels,
  codeSystemSchema,
  matchKindSchema,
  type Qualification,
  type QualificationBasis,
  qualificationBasisSchema,
  qualificationSchema,
} from './enums'
import { formatCount, formatDay, SITE_NAME } from './public'
import { qualificationLabels, RULE_HEADING } from './qualification'

// The code detail page (roadmap M6 step 3; docs/data-model.md, "Matching across states"): one
// code, and every state's status for it in the M4 words (`compareStatusLabels`). The wording
// below is provisional and on the legal team's list (docs/legal-review.md, Part 2); change it here, never in
// components. Like codes (step 4) are not a status: they sit beside it, in `likeCodes`
// (condition-groups.ts), so a like match never reads as a confirmed one.

// ---------------------------------------------------------------------------------------------
// Site setting: which qualification badges to show (docs/data-model.md, "Provisional")

export const showQualificationSettings = ['all', 'published_only', 'none'] as const
export type ShowQualification = (typeof showQualificationSettings)[number]

/** `app_meta.show_qualification`; anything else (or nothing) reads as `all`. */
export function parseShowQualification(value: string | null | undefined): ShowQualification {
  const parsed = z.enum(showQualificationSettings).safeParse(value)
  return parsed.success ? parsed.data : 'all'
}

/** The entry's rule as the setting allows it to be shown; nulls when hidden. */
export function visibleRule(
  rule: { qualification: Qualification; qualificationBasis: QualificationBasis },
  setting: ShowQualification,
): { qualification: Qualification | null; qualificationBasis: QualificationBasis | null } {
  const hidden =
    setting === 'none' || (setting === 'published_only' && rule.qualificationBasis === 'inferred')
  return hidden ? { qualification: null, qualificationBasis: null } : rule
}

// ---------------------------------------------------------------------------------------------
// Response of `GET /api/public/codes/:system/:code`

/** Statuses in page order. */
export const codeDetailStatuses = compareStatuses
export type CodeDetailStatus = CompareStatus

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const codeDetailEntrySchema = z.object({
  /** The code as the state printed it. */
  rawCode: z.string(),
  /** The entry in our notation: `F20.0`, `F20.*`, `F41.*–F42.*`. */
  display: z.string(),
  matchKind: matchKindSchema,
  /** The state's own published text (CPT text only ever comes from here), or null. */
  description: z.string().nullable(),
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  tier: z.string().nullable(),
  /** Null when the `show_qualification` setting hides it. */
  qualification: qualificationSchema.nullable(),
  qualificationBasis: qualificationBasisSchema.nullable(),
  /** Where the state published it. */
  source: z.object({
    title: z.string(),
    url: z.url({ protocol: /^https?$/ }).nullable(),
    publisherDate: isoDate.nullable(),
    /** Page, sheet or row in the document. */
    locator: z.string().nullable(),
  }),
})
export type CodeDetailEntry = z.infer<typeof codeDetailEntrySchema>

export const codeDetailStateSchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
  status: z.enum(codeDetailStatuses),
  /** For `narrower`: how many of the state's entries sit under the code. */
  narrowerCount: z.number().int().min(0),
  /** For `exact` and `covered`: every entry that lists or covers the code, listed first. */
  entries: z.array(codeDetailEntrySchema),
  /** For `not_listed` and `narrower`: codes in another code system in the code's groups. */
  likeCodes: z.array(likeCodeMatchSchema).optional(),
})
export type CodeDetailState = z.infer<typeof codeDetailStateSchema>

export const codeDetailResponseSchema = z.object({
  dataVersion: z.number().int().min(0),
  code: z.object({
    codeSystem: codeSystemSchema,
    codeNorm: z.string(),
    display: z.string(),
    /** The canonical page path (`codeUrlPath`). */
    path: z.string(),
    /** The official CMS text (ICD-10-CM and HCPCS only); never CPT. */
    description: z.string().nullable(),
  }),
  showQualification: z.enum(showQualificationSettings),
  /** The published condition groups the code is in (like codes). */
  conditionGroups: z.array(conditionGroupRefSchema).optional(),
  /** Every state and DC, by name. */
  states: z.array(codeDetailStateSchema),
})
export type CodeDetailResponse = z.infer<typeof codeDetailResponseSchema>

// ---------------------------------------------------------------------------------------------
// Wording (provisional; legal list)

/** One sentence per status: what it means for this code. */
export const codeDetailStatusHelp: Record<CodeDetailStatus, string> = {
  exact: 'The state’s list has this exact code.',
  covered:
    'The state’s list has a broader entry (a wildcard, a range or a parent code with its children) that includes this code.',
  narrower: 'The state lists more specific codes under this one, but not this code itself.',
  not_listed: 'The state has a list on this site, and this code is not on it in any form.',
  no_list: 'This site has no list from this state yet.',
}

/**
 * The heading over the first two groups (design wiki: "confirmed" = listed or covered). Public
 * name "Included" since M6 step 3b: "confirmed" means a reviewed mapping on the state pages.
 */
export const CODE_DETAIL_CONFIRMED = {
  heading: 'Included',
  help: 'These states’ lists include this code: listed itself, or covered by a wildcard, a range or a parent code.',
} as const

export const CODE_DETAIL_OTHERS = {
  heading: 'Not included',
  help: 'These states’ lists do not include this code. Listing more specific codes under it does not count as including it.',
} as const

export const codeDetailTitle = (display: string): string =>
  `${display}: which states include it | ${SITE_NAME}`

export const CODE_DETAIL_NOT_FOUND = {
  title: `Code not found | ${SITE_NAME}`,
  heading: 'Code not found',
  body: 'This code is not in the CMS code sets this site holds (ICD-10-CM and HCPCS), and no state on this site lists it.',
} as const

/** Column headings of an "Included" group's table. */
export const codeDetailColumns = {
  state: 'State',
  entry: 'Entry as published',
  description: 'State’s description',
  category: 'State’s category',
  tier: 'Tier',
  rule: 'State’s rule',
  source: 'Source',
} as const

/** In place of the state's description when it published none. */
export const CODE_DETAIL_NO_DESCRIPTION = 'None published'

/** Under the code's description: where the text comes from. */
export function codeDetailDescriptionNote(system: CodeSystem, hasOfficial: boolean): string {
  if (hasOfficial) return 'Official description from the CMS code set (public domain).'
  if (system === 'cpt') {
    return 'CPT descriptions are not shown here. Each state below shows the text it published, with its source.'
  }
  return 'No official description in the CMS code sets this site holds. Each state below shows the text it published, with its source.'
}

export const codeDetailNarrowerText = (n: number): string =>
  n === 1 ? '1 narrower code listed' : `${String(n)} narrower codes listed`

export interface CodeDetailGroup {
  status: CodeDetailStatus
  heading: string
  help: string
  confirmed: boolean
  states: CodeDetailState[]
}

// ---------------------------------------------------------------------------------------------
// The answer in plain sentences (roadmap M6 step 5; docs/seo.md, "Facts that AI can quote").
// The Vue page and the server-rendered HTML show the same sentences. Provisional; legal list.

const isIncluded = (s: Pick<CodeDetailState, 'status'>) =>
  s.status === 'exact' || s.status === 'covered'

/**
 * Indexed by search engines only when at least one published state includes the code (listed
 * or covered). A code only CMS knows is still a page, but `noindex` (docs/seo.md).
 */
export const codeDetailIndexed = (states: readonly Pick<CodeDetailState, 'status'>[]): boolean =>
  states.some(isIncluded)

/** "F20.0 Paranoid schizophrenia", or "CPT 99213" when there is no CMS text (never CPT text). */
export function codeDetailHeadline(code: CodeDetailResponse['code']): string {
  return code.description
    ? `${code.display} ${code.description}`
    : `${codeSystemLabels[code.codeSystem]} ${code.display}`
}

const statesWord = (n: number) => (n === 1 ? 'state' : 'states')

/** "F20.0 Paranoid schizophrenia: medical frailty status in 4 states | …" (docs/seo.md). */
export function codeDetailPageTitle(
  code: CodeDetailResponse['code'],
  states: readonly Pick<CodeDetailState, 'status'>[],
): string {
  const withList = states.filter((s) => s.status !== 'no_list').length
  const headline = codeDetailHeadline(code)
  if (withList === 0) return codeDetailTitle(headline)
  return `${headline}: medical frailty status in ${formatCount(withList)} ${statesWord(withList)} | ${SITE_NAME}`
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/** Names in the meta description up to this many; more are only counted. */
const META_NAMES_MAX = 5

export function codeDetailMetaDescription(
  code: CodeDetailResponse['code'],
  states: readonly CodeDetailState[],
): string {
  const withList = states.filter((s) => s.status !== 'no_list')
  const included = withList.filter(isIncluded)
  const subject = code.description ? `${code.display} (${code.description})` : code.display
  const names =
    included.length > 0 && included.length <= META_NAMES_MAX
      ? ` (${joinNames(included.map((s) => s.name))})`
      : ''
  const counted =
    included.length === 0
      ? `none of the ${formatCount(withList.length)} ${statesWord(withList.length)} with a list on this site include it`
      : `${formatCount(included.length)} of ${formatCount(withList.length)} ${statesWord(withList.length)} with a list on this site include it`
  return `${subject}: ${counted} in their medical frailty code lists${names}. Each state’s entry, rule and source document.`
}

/**
 * Each code system's official home, for JSON-LD `DefinedTermSet` (docs/seo.md). Drug classes
 * are the state's own grouping, with no public code set to point at.
 */
export const codeSystemSetUrls: Partial<Record<CodeSystem, string>> = {
  icd10cm: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
  icd10pcs: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
  hcpcs: 'https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system',
  cpt: 'https://www.ama-assn.org/practice-management/cpt',
  ndc: 'https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory',
  revenue: 'https://www.nubc.org/',
}

/**
 * The name to give the code when CMS has none (CPT, or a code not in the CMS files): the first
 * state's own text for this exact code, with that state and document, or null. Never a CPT
 * descriptor from anywhere else (docs/data-model.md, "Licensing of code text").
 */
export function codeDetailStateName(
  states: readonly CodeDetailState[],
): { text: string; stateName: string; sourceTitle: string } | null {
  for (const s of states) {
    if (s.status !== 'exact') continue
    const e = s.entries.find((x) => x.matchKind === 'exact' && x.description !== null)
    if (e?.description)
      return { text: e.description, stateName: s.name, sourceTitle: e.source.title }
  }
  return null
}

/** "State’s rule: Enough by itself (inferred by this site)." Null when the setting hides it. */
function ruleSentence(entry: CodeDetailEntry | undefined): string | null {
  if (!entry?.qualification) return null
  const inferred = entry.qualificationBasis === 'inferred' ? ' (inferred by this site)' : ''
  return `${RULE_HEADING}: ${qualificationLabels[entry.qualification]}${inferred}.`
}

/**
 * One plain sentence (two with the rule) for a state with a list; null for a state without one.
 * The rule is the first entry's, which the API sorts first: listed before covered, then the
 * rule that qualifies most on its own.
 */
export function codeDetailStateSentence(state: CodeDetailState, display: string): string | null {
  const own = `${state.name}’s list`
  switch (state.status) {
    case 'exact':
    case 'covered': {
      const first = state.entries[0]
      const via = state.status === 'covered' && first ? ` through its entry ${first.display}` : ''
      const rule = ruleSentence(first)
      return `${own} includes ${display}${via}.${rule ? ` ${rule}` : ''}`
    }
    case 'narrower':
      return `${own} does not include ${display} itself, but lists ${formatCount(state.narrowerCount)} more specific ${state.narrowerCount === 1 ? 'code' : 'codes'} under it.`
    case 'not_listed':
      return `${own} does not include ${display}.`
    case 'no_list':
      return null
  }
}

export interface CodeDetailSummary {
  /** "2 of 4 states with a list on this site include F20.0." */
  count: string
  /** "Included", then "Not included", as the page groups them; empty parts left out. */
  parts: { id: 'confirmed' | 'others'; heading: string; sentences: string[] }[]
}

export function codeDetailSummary(
  code: Pick<CodeDetailResponse['code'], 'display'>,
  states: readonly CodeDetailState[],
): CodeDetailSummary {
  const withList = states.filter((s) => s.status !== 'no_list')
  const included = withList.filter(isIncluded).length
  const sentencesOf = (keep: (s: CodeDetailState) => boolean) =>
    codeDetailGroups(withList.filter(keep)).flatMap((g) =>
      g.states.flatMap((s) => codeDetailStateSentence(s, code.display) ?? []),
    )
  const parts = [
    {
      id: 'confirmed' as const,
      heading: CODE_DETAIL_CONFIRMED.heading,
      sentences: sentencesOf(isIncluded),
    },
    {
      id: 'others' as const,
      heading: CODE_DETAIL_OTHERS.heading,
      sentences: sentencesOf((s) => !isIncluded(s)),
    },
  ].filter((p) => p.sentences.length > 0)
  return {
    count:
      withList.length === 0
        ? 'No state has a list on this site yet.'
        : `${formatCount(included)} of ${formatCount(withList.length)} ${statesWord(withList.length)} with a list on this site include ${code.display}.`,
    parts,
  }
}

/** "Last updated on this site <day>.", as on the state pages. */
export const codeDetailUpdatedText = (day: string): string =>
  `Last updated on this site ${formatDay(day)}.`

/** The states grouped by status, in page order; empty groups left out. */
export function codeDetailGroups(states: readonly CodeDetailState[]): CodeDetailGroup[] {
  return codeDetailStatuses.flatMap((status) => {
    const members = states.filter((s) => s.status === status)
    if (members.length === 0) return []
    return [
      {
        status,
        heading: compareStatusLabels[status],
        help: codeDetailStatusHelp[status],
        confirmed: status === 'exact' || status === 'covered',
        states: members,
      },
    ]
  })
}
