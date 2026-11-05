import { z } from 'zod'

import {
  mappingBasisSchema,
  mappingConfidenceSchema,
  mappingRelationSchema,
  type UnifiedStatus,
  unifiedStatusSchema,
} from './enums'
import { saveWarningSchema } from './errors'
import {
  ccsrCategorySchema,
  unifiedCategorySaveSchema,
  unifiedCategorySchema,
  unifiedMappingSchema,
  unifiedSlugSchema,
} from './unified'

// Admin API for unified categories and their mappings (roadmap M5 step 3; docs/data-model.md,
// "Unified categories (M5)"). Bodies, responses and the pure rules the routes apply.

// ---------------------------------------------------------------------------------------------
// Unified categories

/** A slug from a label: lowercase ASCII words joined by hyphens, at most 80 characters. */
export function unifiedSlugFromLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')
}

/** Body of `POST /api/admin/unified` and `PUT /api/admin/unified/:id`. */
export const unifiedCategoryBodySchema = unifiedCategorySaveSchema.extend({
  /** Omitted: made from the label on create, kept on edit. */
  slug: unifiedSlugSchema.optional(),
  status: unifiedStatusSchema.default('draft'),
})

export type UnifiedCategoryBody = z.infer<typeof unifiedCategoryBodySchema>

/**
 * Draft → published or retired (a draft never published may be retired: project lead,
 * 2026-11-02), published ⇄ retired. Never back to draft once out of draft.
 */
export function unifiedStatusChangeAllowed(from: UnifiedStatus, to: UnifiedStatus): boolean {
  if (from === to) return true
  return to !== 'draft'
}

interface VersionedFields {
  label: string
  definition: string
  includes: string | null
  excludes: string | null
}

/** `version` + 1 when the label, definition, includes or excludes change. */
export function unifiedVersionChanges(before: VersionedFields, after: VersionedFields): boolean {
  return (
    before.label !== after.label ||
    before.definition !== after.definition ||
    before.includes !== after.includes ||
    before.excludes !== after.excludes
  )
}

/** Body of `GET /api/admin/unified`. */
export const unifiedListResponseSchema = z.object({
  items: z.array(
    unifiedCategorySchema.extend({
      /** The CCSR groups with their names (null when the reference data is not loaded). */
      ccsrGroups: z.array(
        z.object({ ccsrCategory: ccsrCategorySchema, description: z.string().nullable() }),
      ),
      approvedMappings: z.number().int().min(0),
    }),
  ),
})

export type UnifiedListResponse = z.infer<typeof unifiedListResponseSchema>
export type UnifiedListItem = UnifiedListResponse['items'][number]

/** Body of a successful create or edit. */
export const unifiedSaveResponseSchema = z.object({
  id: z.number().int().positive(),
  slug: unifiedSlugSchema,
  version: z.number().int().positive(),
  warning: saveWarningSchema,
})

/**
 * The rebuild's steps, in order: each category's full code list, then each state's
 * placements, then each state's pair similarity (it reads the placements' codes).
 */
export const coverageRebuildStepSchema = z.enum(['universe', 'placements', 'similarity'])

export type CoverageRebuildStep = z.infer<typeof coverageRebuildStepSchema>

/** Where the next call starts: after this unit (a category id, or a state id) of `step`. */
export const coverageRebuildCursorSchema = z
  .object({ step: coverageRebuildStepSchema, after: z.string().min(1).max(64) })
  .strict()

export type CoverageRebuildCursor = z.infer<typeof coverageRebuildCursorSchema>

/**
 * Body of `POST /api/admin/coverage/rebuild`. The first call sends `{}`; each later call sends
 * the `next` cursor of the last answer. `budgetMs` (tests) caps the work per call: 0 does one
 * unit.
 */
export const coverageRebuildRequestSchema = z
  .object({
    cursor: coverageRebuildCursorSchema.optional(),
    budgetMs: z.number().int().min(0).max(60_000).optional(),
  })
  .strict()

export type CoverageRebuildRequest = z.infer<typeof coverageRebuildRequestSchema>

/**
 * Answer of `POST /api/admin/coverage/rebuild` (docs/deployment.md, "Preview data"): how far
 * the rebuild got, and the derived tables' sizes now. Until `done`, call again with `next`.
 */
export const coverageRebuildResponseSchema = z.object({
  done: z.boolean(),
  next: coverageRebuildCursorSchema.nullable(),
  /** The step of the last unit done, with its units done and in all. */
  progress: z.object({
    step: coverageRebuildStepSchema,
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** Unified categories (not retired) whose full code list is rebuilt. */
  categories: z.number().int().nonnegative(),
  universeCodes: z.number().int().nonnegative(),
  placements: z.number().int().nonnegative(),
  similarPairs: z.number().int().nonnegative(),
  /** This call's wall time. */
  ms: z.number().nonnegative(),
})

export type CoverageRebuildResponse = z.infer<typeof coverageRebuildResponseSchema>

/** Each step in admin text. */
export const coverageRebuildStepLabels: Record<CoverageRebuildStep, string> = {
  universe: 'full code lists',
  placements: 'placements',
  similarity: 'state similarity',
}

const coverageRebuildUnits: Record<CoverageRebuildStep, string> = {
  universe: 'categories',
  placements: 'states',
  similarity: 'states',
}

/** "Rebuilding… full code lists: 7 of 19 categories". */
export function coverageRebuildProgressText(progress: CoverageRebuildResponse['progress']): string {
  return `Rebuilding… ${coverageRebuildStepLabels[progress.step]}: ${String(progress.completed)} of ${String(progress.total)} ${coverageRebuildUnits[progress.step]}`
}

/** Body of `GET /api/admin/ccsr-categories`. */
export const ccsrCategoryListResponseSchema = z.object({
  items: z.array(
    z.object({
      ccsrCategory: ccsrCategorySchema,
      description: z.string(),
      bodySystem: z.string(),
    }),
  ),
})

export type CcsrCategoryListResponse = z.infer<typeof ccsrCategoryListResponseSchema>

// ---------------------------------------------------------------------------------------------
// Mappings

const label = z.string().max(200)
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null)

/** One target of a state category: a unified category and how it relates. */
export const unifiedMappingTargetSchema = z.object({
  unifiedId: z.number().int().positive(),
  relation: mappingRelationSchema.exclude(['by_code']),
  basis: mappingBasisSchema,
  confidence: mappingConfidenceSchema,
  rationale: optionalText(4000),
  citation: optionalText(1000),
})

export type UnifiedMappingTarget = z.infer<typeof unifiedMappingTargetSchema>

const categoryKey = {
  stateCategory: label,
  stateSubcategory: label,
}

/**
 * Body of `PUT /api/admin/states/:stateId/unified-mappings`: one state category, mapped to one
 * or more targets, or "place each code by its CCSR group" (`byCode`). `approve` saves it as
 * approved (reviewed by this admin) instead of proposed.
 */
export const unifiedMappingPutSchema = z.union([
  z.strictObject({
    ...categoryKey,
    approve: z.boolean(),
    targets: z
      .array(unifiedMappingTargetSchema)
      .min(1)
      .max(20)
      .refine((ts) => new Set(ts.map((t) => t.unifiedId)).size === ts.length, {
        message: 'Each unified category may be a target once',
      }),
  }),
  z.strictObject({
    ...categoryKey,
    approve: z.boolean(),
    byCode: z.literal(true),
    basis: mappingBasisSchema.default('admin_judgement'),
    confidence: mappingConfidenceSchema.default('high'),
    rationale: optionalText(4000),
    citation: optionalText(1000),
  }),
])

export type UnifiedMappingPut = z.infer<typeof unifiedMappingPutSchema>

/** Body of `POST /api/admin/states/:stateId/unified-mappings/approve`. */
export const unifiedMappingApproveSchema = z.strictObject(categoryKey)

/** "Reviewed by one admin" is what the UI says of an approved mapping. */
export const unifiedMappingSaveResponseSchema = z.object({
  ok: z.literal(true),
  status: z.enum(['approved', 'proposed']),
  review: z.enum(['Reviewed by one admin', 'Proposed']),
  warning: saveWarningSchema,
})

const suggestionSchema = z.object({
  /** The CCSR groups of the category's ICD-10-CM entries: entries per group, top 8. */
  ccsr: z.array(
    z.object({
      ccsrCategory: z.string(),
      count: z.number().int().min(1),
      description: z.string().nullable().optional(),
    }),
  ),
  /** Unified categories (any status) sharing those groups, and the share of entries covered. */
  unified: z.array(
    z.object({
      unifiedId: z.number().int().positive(),
      label: z.string(),
      status: unifiedStatusSchema,
      covered: z.number().int().min(1),
      share: z.number().min(0).max(1),
    }),
  ),
  /** ICD-10-CM entries with no CCSR group. */
  withoutCcsr: z.number().int().min(0),
})

export type UnifiedSuggestion = z.infer<typeof suggestionSchema>

/** Body of `GET /api/admin/states/:stateId/unified-mappings`. */
export const stateUnifiedMappingsResponseSchema = z.object({
  categories: z.array(
    z.object({
      stateCategory: z.string(),
      stateSubcategory: z.string(),
      entries: z.number().int().min(0),
      icdEntries: z.number().int().min(0),
      /** Current rows: approved and proposed (superseded rows are history). */
      mappings: z.array(unifiedMappingSchema),
      suggestion: suggestionSchema,
    }),
  ),
})

export type StateUnifiedMappings = z.infer<typeof stateUnifiedMappingsResponseSchema>
export type StateUnifiedCategory = StateUnifiedMappings['categories'][number]

const TOP_CCSR = 8

/**
 * The suggestion for one state category, from the CCSR groups of each of its ICD-10-CM entries
 * (`ccsrGroupsCovered`): entries per group (top 8), and every unified category whose groups
 * include one of an entry's, with how many of the entries it would cover.
 */
export function unifiedSuggestion(
  entryGroups: readonly (readonly string[])[],
  categories: readonly {
    id: number
    label: string
    status: UnifiedStatus
    ccsr: readonly string[]
  }[],
): UnifiedSuggestion {
  const counts = new Map<string, number>()
  let withoutCcsr = 0
  for (const groups of entryGroups) {
    if (groups.length === 0) withoutCcsr++
    for (const g of new Set(groups)) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  const ccsr = [...counts]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, TOP_CCSR)
    .map(([ccsrCategory, count]) => ({ ccsrCategory, count }))
  const total = entryGroups.length
  const unified = categories
    .map((c) => {
      const own = new Set(c.ccsr)
      const covered = entryGroups.filter((groups) => groups.some((g) => own.has(g))).length
      return { unifiedId: c.id, label: c.label, status: c.status, covered, share: covered / total }
    })
    .filter((u) => u.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.unifiedId - b.unifiedId)
  return { ccsr, unified, withoutCcsr }
}
