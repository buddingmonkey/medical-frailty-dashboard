import { z } from 'zod'

import { type CodeSystem, type FederalCategory, federalCategories } from './enums'
import { icd10cmChapterOf } from './icd-chapters'

// Which federal category an entry falls under (docs/data-model.md, "Federal categories";
// docs/ingestion.md, "Category auto-mapping"). One rule for the admin screen and the public
// pages: an ICD-10-CM chapter override of the state wins, then the mapping of the entry's state
// category, else "unmapped" (shown as Unclassified).

/** Key of a state category in a mapping table: trimmed, case ignored. */
export function mappingKey(stateCategory: string, stateSubcategory: string): string {
  return `${stateCategory.trim().toLowerCase()}|${stateSubcategory.trim().toLowerCase()}`
}

export function federalCategoryOf(
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

/** A federal category an admin can choose: every one except "unmapped". */
const chosenCategory = z.enum(federalCategories).exclude(['unmapped'])
const label = z.string().max(200)

/** Body of `PUT /api/admin/states/:stateId/categories`: confirmed (manual) mappings. */
export const categoryMappingSaveSchema = z.object({
  items: z
    .array(
      z.object({
        stateCategory: label,
        stateSubcategory: label,
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
