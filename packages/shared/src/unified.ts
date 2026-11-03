import { z } from 'zod'

import { mappingKey } from './category-mapping'
import {
  type CodeSystem,
  federalCategories,
  mappingBasisSchema,
  mappingConfidenceSchema,
  type MappingRelation,
  mappingRelationSchema,
  type UnifiedMappingStatus,
  unifiedMappingStatusSchema,
  type UnifiedStatus,
  unifiedStatusSchema,
} from './enums'

// Unified categories: admin-curated groups between the federal categories and each state's own
// (docs/data-model.md, "Unified categories (M5)"). `unifiedOf` is the one rule the admin and
// public pages use to place an entry. Pure: the caller passes the mappings, the categories
// with their CCSR groups, and the entry's CCSR groups.

/**
 * Slugs a unified category may not take, because the site uses them under `/compare/` (the
 * category drill-down lives at `/compare/<slug>`): `codes` is the M4 code table (M5 step 5),
 * `states` the state comparison (`/compare/states/ga-vs-la`, M5 step 7).
 */
export const reservedUnifiedSlugs: readonly string[] = ['codes', 'states']

export const isReservedUnifiedSlug = (slug: string): boolean => reservedUnifiedSlugs.includes(slug)

/** URL slug (`/compare/<slug>`): lowercase words of letters and digits, joined by hyphens. */
export const unifiedSlugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !isReservedUnifiedSlug(slug), { message: 'This slug is reserved' })

/** An AHRQ CCSR category, e.g. `MBD001`. */
export const ccsrCategorySchema = z.string().regex(/^[A-Z]{3}\d{3}$/)

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null)
const timestamp = z.iso.datetime()

/** A federal parent: any federal category except "unmapped". */
const parentCategory = z.enum(federalCategories).exclude(['unmapped'])

/** The fields an admin edits on a unified category (later: the admin API's body). */
export const unifiedCategorySaveSchema = z.object({
  slug: unifiedSlugSchema,
  label: text(200),
  definition: text(4000),
  includes: optionalText(4000),
  excludes: optionalText(4000),
  federalCategory: parentCategory,
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  /** The CCSR groups whose ICD-10-CM codes belong to the category. */
  ccsr: z.array(ccsrCategorySchema).max(200).default([]),
})

export type UnifiedCategorySave = z.infer<typeof unifiedCategorySaveSchema>

/** A stored unified category, as the API returns it. */
export const unifiedCategorySchema = unifiedCategorySaveSchema.extend({
  id: z.number().int().positive(),
  status: unifiedStatusSchema,
  /** +1 on each edit of label, definition, includes or excludes. */
  version: z.number().int().positive(),
  createdBy: z.string(),
  createdAt: timestamp,
  updatedBy: z.string(),
  updatedAt: timestamp,
})

export type UnifiedCategory = z.infer<typeof unifiedCategorySchema>

const label = z.string().max(200)

const mappingSaveFields = z.object({
  stateCategory: label,
  stateSubcategory: label,
  /** NULL exactly when the relation is `by_code`. */
  unifiedId: z.number().int().positive().nullable(),
  relation: mappingRelationSchema,
  basis: mappingBasisSchema,
  confidence: mappingConfidenceSchema,
  rationale: optionalText(4000),
  citation: optionalText(1000),
})

const byCodeHasNoTarget = (m: { relation: MappingRelation; unifiedId: number | null }) =>
  (m.relation === 'by_code') === (m.unifiedId === null)
const byCodeMessage = { message: 'by_code has no target; every other relation needs one' }

/** A proposed mapping from a state category to one unified category (later: the API's body). */
export const unifiedMappingSaveSchema = mappingSaveFields.refine(byCodeHasNoTarget, byCodeMessage)

export type UnifiedMappingSave = z.infer<typeof unifiedMappingSaveSchema>

/** A stored mapping, as the API returns it. */
export const unifiedMappingSchema = mappingSaveFields
  .extend({
    id: z.number().int().positive(),
    stateId: z.string().regex(/^[A-Z]{2}$/),
    mappedBy: z.string(),
    mappedAt: timestamp,
    reviewedBy: z.string().nullable(),
    reviewedAt: timestamp.nullable(),
    status: unifiedMappingStatusSchema,
    supersededBy: z.number().int().positive().nullable(),
  })
  .refine(byCodeHasNoTarget, byCodeMessage)

export type UnifiedMapping = z.infer<typeof unifiedMappingSchema>

/** The fields of a mapping row that `unifiedOf` reads. */
export interface UnifiedMappingRow {
  stateId: string
  stateCategory: string
  stateSubcategory: string
  unifiedId: number | null
  relation: MappingRelation
  status: UnifiedMappingStatus
}

export interface UnifiedOfContext {
  /** Mappings of any state and status; only the approved ones of the entry's category count. */
  mappings: readonly UnifiedMappingRow[]
  /** Every unified category by id, with its status and CCSR groups. */
  categories: ReadonlyMap<number, { status: UnifiedStatus; ccsr: ReadonlySet<string> }>
  /** The entry's CCSR groups: empty when unknown or not ICD-10-CM. */
  entryCcsr: readonly string[]
  /** Admin previews: count draft categories too. Public pages: published only. */
  includeDrafts?: boolean
}

export interface UnifiedPlacement {
  /** Ascending, no repeats. Empty: "Unclassified" for unified views. */
  unifiedIds: number[]
  /** `mapping`: an approved mapping to named targets. `by_code`: placed by CCSR. */
  basis: 'mapping' | 'by_code' | 'none'
  /** An admin approved the placement (an approved mapping, or an approved `by_code` row). */
  reviewed: boolean
}

/**
 * Which unified categories an entry counts under (docs/data-model.md, "Unified categories
 * (M5)"):
 * 1. the approved mappings of the entry's state category (`mappingKey`);
 * 2. targets: one → it; several → those sharing a CCSR group with the entry (ICD-10-CM only),
 *    else all of them;
 * 3. otherwise ICD-10-CM entries go by their CCSR groups, other code systems nowhere;
 * 4. retired categories never count, and drafts only with `includeDrafts`.
 *
 * Targets the caller cannot see (retired, or draft on public pages) are dropped before rule 2:
 * a mapping to them is no mapping, so the public never loses an entry to an admin's draft.
 * Publishing a draft can then move entries into it from another target of the same mapping.
 */
export function unifiedOf(
  entry: {
    stateId: string
    codeSystem: CodeSystem
    stateCategory: string
    stateSubcategory: string
  },
  ctx: UnifiedOfContext,
): UnifiedPlacement {
  const key = mappingKey(entry.stateCategory, entry.stateSubcategory)
  const approved = ctx.mappings.filter(
    (m) =>
      m.status === 'approved' &&
      m.stateId === entry.stateId &&
      mappingKey(m.stateCategory, m.stateSubcategory) === key,
  )
  const isIcd = entry.codeSystem === 'icd10cm'
  const entryCcsr = isIcd ? ctx.entryCcsr : []
  const sharesCcsr = (id: number) => {
    const groups = ctx.categories.get(id)?.ccsr
    return groups !== undefined && entryCcsr.some((g) => groups.has(g))
  }
  const visible = (id: number) => {
    const status = ctx.categories.get(id)?.status
    return status === 'published' || (status === 'draft' && ctx.includeDrafts === true)
  }

  const targets = unique(
    approved.flatMap((m) => (m.unifiedId !== null && visible(m.unifiedId) ? [m.unifiedId] : [])),
  )
  if (targets.length > 0) {
    const matching = targets.length > 1 ? targets.filter(sharesCcsr) : targets
    const chosen = matching.length > 0 ? matching : targets
    return { unifiedIds: chosen, basis: 'mapping', reviewed: true }
  }

  if (!isIcd) return { unifiedIds: [], basis: 'none', reviewed: false }
  const byCode = [...ctx.categories.keys()].filter((id) => visible(id) && sharesCcsr(id))
  return {
    unifiedIds: unique(byCode),
    basis: 'by_code',
    reviewed: approved.some((m) => m.relation === 'by_code'),
  }
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}
