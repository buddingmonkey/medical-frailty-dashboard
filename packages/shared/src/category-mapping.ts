import { z } from 'zod'

import { type CodeSystem, type FederalCategory, federalCategories } from './enums'
import { icd10cmChapterOf } from './icd-chapters'

// Which federal categories an entry counts under (docs/data-model.md, "Federal categories").
// One rule for the admin screens and the public pages (project lead, 2026-11-02: "Federal
// category should be pre mapped"): the federal parents of the published unified categories
// the entry is placed in (`entry_unified`), each once, so a code in two unified categories
// with different parents counts under both. An entry placed nowhere falls back to the M2 rule:
// an ICD-10-CM chapter override of the state wins, then the mapping of the entry's state
// category, else "unmapped" (shown as Unclassified).

/** Key of a state category in a mapping table: trimmed, case ignored. */
export function mappingKey(stateCategory: string, stateSubcategory: string): string {
  return `${stateCategory.trim().toLowerCase()}|${stateSubcategory.trim().toLowerCase()}`
}

/** The M2 rule, for an entry with no placement: chapter override, state category, unmapped. */
function mappedFederalCategory(
  entry: {
    codeSystem: CodeSystem
    codeNorm: string
    stateCategory: string
    stateSubcategory: string
  },
  mappings: ReadonlyMap<string, FederalCategory>,
  chapterOverrides: ReadonlyMap<number, FederalCategory>,
): FederalCategory {
  if (entry.codeSystem === 'icd10cm' && chapterOverrides.size > 0) {
    const chapter = icd10cmChapterOf(entry.codeNorm)
    const override = chapter ? chapterOverrides.get(chapter.number) : undefined
    if (override) return override
  }
  return mappings.get(mappingKey(entry.stateCategory, entry.stateSubcategory)) ?? 'unmapped'
}

/**
 * The federal categories an entry counts under, in federal order: the parents of its unified
 * categories (`unifiedParents`, repeats allowed), else the M2 mapping as the only one.
 */
export function federalCategoriesOf(
  entry: {
    codeSystem: CodeSystem
    codeNorm: string
    stateCategory: string
    stateSubcategory: string
  },
  unifiedParents: readonly FederalCategory[],
  mappings: ReadonlyMap<string, FederalCategory>,
  chapterOverrides: ReadonlyMap<number, FederalCategory>,
): FederalCategory[] {
  if (unifiedParents.length > 0) {
    const parents = new Set(unifiedParents)
    return federalCategories.filter((f) => parents.has(f))
  }
  return [mappedFederalCategory(entry, mappings, chapterOverrides)]
}

/** The parents as SQL's `group_concat` returns them (null when none), known values only. */
export function federalCategoryList(text: string | null): FederalCategory[] {
  if (text === null || text === '') return []
  const known = new Set<string>(federalCategories)
  return text.split(',').filter((f): f is FederalCategory => known.has(f))
}

/** A federal category an admin can choose: every one except "unmapped". */
export const chosenCategory = z.enum(federalCategories).exclude(['unmapped'])
export type ChosenFederalCategory = z.infer<typeof chosenCategory>
export const categoryLabel = z.string().max(200)

/** Body of `PUT /api/admin/states/:stateId/categories`: confirmed (manual) mappings. */
export const categoryMappingSaveSchema = z.object({
  items: z
    .array(
      z.object({
        stateCategory: categoryLabel,
        stateSubcategory: categoryLabel,
        federalCategory: chosenCategory,
      }),
    )
    .min(1)
    .max(200),
})

/** Body of `PUT /api/admin/states/:stateId/chapters/:chapter`; null removes the override. */
export const chapterOverrideSaveSchema = z.object({ federalCategory: chosenCategory.nullable() })

const mappingInfo = z.object({
  federalCategory: z.enum(federalCategories),
  method: z.enum(['auto', 'manual']),
  confidence: z.number().nullable(),
  mappedBy: z.string().nullable(),
  mappedAt: z.string().nullable(),
})

/** `GET /api/admin/states/:stateId/categories`. */
export const stateCategoriesResponseSchema = z.object({
  categories: z.array(
    z.object({
      stateCategory: z.string(),
      stateSubcategory: z.string(),
      /** Entries in the published version, and in open drafts. */
      publishedEntries: z.number().int().nonnegative(),
      draftEntries: z.number().int().nonnegative(),
      /**
       * Published entries placed in a published unified category: their federal categories
       * are those categories' parents (`placedFederal`), and the mapping here does not apply.
       */
      placedEntries: z.number().int().nonnegative(),
      placedFederal: z.array(z.enum(federalCategories)),
      mapping: mappingInfo.nullable(),
      /** The keyword table's guess (autoMapCategory), when there is one. */
      suggestion: z
        .object({
          federalCategory: z.enum(federalCategories),
          keyword: z.string(),
          confidence: z.number(),
        })
        .nullable(),
    }),
  ),
  chapters: z.array(
    z.object({
      chapter: z.number().int().positive(),
      title: z.string(),
      publishedEntries: z.number().int().nonnegative(),
      draftEntries: z.number().int().nonnegative(),
      override: mappingInfo.omit({ method: true, confidence: true }).nullable(),
    }),
  ),
})
export type StateCategories = z.infer<typeof stateCategoriesResponseSchema>
