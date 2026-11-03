import { z } from 'zod'

import { type CompareStatus, compareStatuses, compareStatusLabels } from './compare'
import {
  type CodeSystem,
  codeSystemSchema,
  matchKindSchema,
  type Qualification,
  type QualificationBasis,
  qualificationBasisSchema,
  qualificationSchema,
} from './enums'
import { SITE_NAME } from './public'

// The code detail page (roadmap M6 step 3; docs/data-model.md, "Matching across states"): one
// code, and every state's status for it in the M4 words (`compareStatusLabels`). The wording
// below is provisional and on the legal team's list (docs/status.md); change it here, never in
// components. Step 4 adds a `like` status ("like codes" in another code system, by condition
// group): it goes after `narrower` in `codeDetailStatuses`, with its help text and the
// matching codes on each state.

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

/** Statuses in page order. Step 4 inserts `like` after `narrower`. */
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
