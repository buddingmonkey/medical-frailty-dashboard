import { z } from 'zod'

import { type CodeSystem, type FederalCategory, federalCategories } from './enums'
import type { StoredSuggestion } from './federal-suggestions'
import { icd10cmChapterOf } from './icd-chapters'

// Which federal categories an entry counts under (docs/data-model.md, "Federal categories").
// One rule for the admin screens and the public pages, first match wins:
//
// 1. `stated`: the state published the entry's federal categories (Indiana's column,
//    `entries.state_federal_categories`; project lead, 2026-11-13).
// 2. `placed`: the federal parents of the published unified categories the entry is placed in
//    (`entry_unified`), each once (project lead, 2026-11-02: "Federal category should be pre
//    mapped").
// 3. `chapter`: an ICD-10-CM chapter override of the state (always set by an admin), or
//    `system`: a code-system override of the state for its entries of every other system
//    (NDC, HCPCS…; project lead, 2026-11-21). The two never meet: one entry has one system.
// 4. `suggestedReviewed`: a suggestion by code that an admin confirmed (per code, so more
//    specific than a category mapping).
// 5. `manual`: the confirmed mapping of the entry's state category.
// 6. `suggested`: a suggestion by code from another state's list (`federal-suggestions.ts`;
//    project lead, 2026-11-13), not yet reviewed.
// 7. `auto`: the keyword guess for the state category.
// 8. `unmapped` (shown as "Not yet classified").

/**
 * Code systems a state can have a code-system override for (rule 3, `system`): every one but
 * ICD-10-CM, which has chapter overrides instead (project lead, 2026-11-21).
 */
export const overrideSystems = [
  'icd10pcs',
  'cpt',
  'hcpcs',
  'ndc',
  'revenue',
  'drug_class',
  'other',
] as const satisfies readonly Exclude<CodeSystem, 'icd10cm'>[]
export type OverrideSystem = (typeof overrideSystems)[number]
export const overrideSystemSchema = z.enum(overrideSystems)

/** Key of a state category in a mapping table: trimmed, case ignored. */
export function mappingKey(stateCategory: string, stateSubcategory: string): string {
  return `${stateCategory.trim().toLowerCase()}|${stateSubcategory.trim().toLowerCase()}`
}

export const federalRules = [
  'stated',
  'placed',
  'chapter',
  'system',
  'suggestedReviewed',
  'manual',
  'suggested',
  'auto',
  'unmapped',
] as const
export type FederalRule = (typeof federalRules)[number]

/** Rules that count as confirmed (public "Reviewed", `mappingsConfirmed`), except `placed`. */
export const confirmedRules: ReadonlySet<FederalRule> = new Set<FederalRule>([
  'stated',
  'chapter',
  'system',
  'suggestedReviewed',
  'manual',
])

/** The entry fields the rule reads. */
export interface FederalRuleEntry {
  codeSystem: CodeSystem
  codeNorm: string
  stateCategory: string
  stateSubcategory: string
  /** The state's own federal categories for the entry; empty or left out: none. */
  stateFederalCategories?: readonly FederalCategory[]
  /** The entry's suggestion by code (`decodeSuggestion`); null or left out: none. */
  suggestion?: Pick<StoredSuggestion, 'categories' | 'reviewed'> | null
}

/**
 * Which rule decides the entry's federal categories, and the categories, in federal order.
 * `chapterOverrides` are the state's ICD-10-CM chapter overrides, `systemOverrides` its
 * overrides by code system (never ICD-10-CM).
 * `manualKeys` names the state categories whose mapping an admin confirmed (`mappingKey`);
 * left out, every mapping counts as manual, so a suggestion never beats one by mistake.
 */
export function federalRuleOf(
  entry: FederalRuleEntry,
  unifiedParents: readonly FederalCategory[],
  mappings: ReadonlyMap<string, FederalCategory>,
  chapterOverrides: ReadonlyMap<number, FederalCategory>,
  systemOverrides: ReadonlyMap<CodeSystem, FederalCategory>,
  manualKeys?: ReadonlySet<string>,
): { rule: FederalRule; categories: FederalCategory[] } {
  const inOrder = (list: readonly FederalCategory[]) => {
    const set = new Set(list)
    return federalCategories.filter((f) => set.has(f))
  }
  const stated = entry.stateFederalCategories ?? []
  if (stated.length > 0) return { rule: 'stated', categories: inOrder(stated) }
  if (unifiedParents.length > 0) return { rule: 'placed', categories: inOrder(unifiedParents) }
  if (entry.codeSystem === 'icd10cm' && chapterOverrides.size > 0) {
    const chapter = icd10cmChapterOf(entry.codeNorm)
    const override = chapter ? chapterOverrides.get(chapter.number) : undefined
    if (override) return { rule: 'chapter', categories: [override] }
  }
  if (entry.codeSystem !== 'icd10cm') {
    const override = systemOverrides.get(entry.codeSystem)
    if (override) return { rule: 'system', categories: [override] }
  }
  const suggestion = entry.suggestion
  const suggested = suggestion && suggestion.categories.length > 0 ? suggestion : null
  if (suggested?.reviewed) {
    return { rule: 'suggestedReviewed', categories: inOrder(suggested.categories) }
  }
  const key = mappingKey(entry.stateCategory, entry.stateSubcategory)
  const mapped = mappings.get(key)
  const manual = mapped !== undefined && (manualKeys === undefined || manualKeys.has(key))
  if (mapped !== undefined && manual) {
    return { rule: mapped === 'unmapped' ? 'unmapped' : 'manual', categories: [mapped] }
  }
  if (suggested) return { rule: 'suggested', categories: inOrder(suggested.categories) }
  if (mapped !== undefined && mapped !== 'unmapped') return { rule: 'auto', categories: [mapped] }
  return { rule: 'unmapped', categories: ['unmapped'] }
}

/**
 * The federal categories an entry counts under, in federal order (`federalRuleOf`): the ones
 * the state published for it, else the parents of its unified categories (repeats allowed),
 * else one from a chapter or code-system override, a suggestion or the state category's mapping.
 */
export function federalCategoriesOf(
  entry: FederalRuleEntry,
  unifiedParents: readonly FederalCategory[],
  mappings: ReadonlyMap<string, FederalCategory>,
  chapterOverrides: ReadonlyMap<number, FederalCategory>,
  systemOverrides: ReadonlyMap<CodeSystem, FederalCategory>,
  manualKeys?: ReadonlySet<string>,
): FederalCategory[] {
  return federalRuleOf(
    entry,
    unifiedParents,
    mappings,
    chapterOverrides,
    systemOverrides,
    manualKeys,
  ).categories
}

/** The parents as SQL's `group_concat` returns them (null when none), known values only. */
export function federalCategoryList(text: string | null): FederalCategory[] {
  if (text === null || text === '') return []
  const known = new Set<string>(federalCategories)
  return text.split(',').filter((f): f is FederalCategory => known.has(f))
}

/** A federal category an admin can choose: every one except "unmapped". */
export const chosenCategory = z.enum(federalCategories).exclude(['unmapped'])
/** The same list as a constant, for CHECK constraints (a test checks it against the enum). */
export const chosenFederalCategories = [
  'blind_or_disabled',
  'sud',
  'disabling_mental_disorder',
  'physical_idd_adl',
  'serious_complex_medical',
  'state_specific',
] as const satisfies readonly ChosenFederalCategory[]
export type ChosenFederalCategory = z.infer<typeof chosenCategory>
export const categoryLabel = z.string().max(200)

/** Body of `PUT /api/admin/states/:stateId/categories`: stored mappings to confirm (manual). */
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
       * Published entries whose state published their federal categories (`statedFederal`,
       * "Stated by the state"): neither placements nor the mapping here apply to them.
       */
      statedEntries: z.number().int().nonnegative(),
      statedFederal: z.array(z.enum(federalCategories)),
      /**
       * Other published entries placed in a published unified category: their federal
       * categories are those categories' parents (`placedFederal`), and the mapping here does
       * not apply.
       */
      placedEntries: z.number().int().nonnegative(),
      placedFederal: z.array(z.enum(federalCategories)),
      /**
       * Other published entries whose federal categories come from a suggestion by code (rules
       * 4 and 6): how many, how many still unreviewed (`pending`, what "Confirm suggestions"
       * confirms), under which federal categories, and from which states' lists.
       */
      codeSuggested: z
        .object({
          entries: z.number().int().nonnegative(),
          pending: z.number().int().nonnegative(),
          federal: z.array(z.enum(federalCategories)),
          referenceNames: z.array(z.string()),
        })
        .default({ entries: 0, pending: 0, federal: [], referenceNames: [] }),
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
  /**
   * Code systems other than ICD-10-CM that the published version or an open draft holds, with
   * the state's override for each (rule 3, `system`), in `codeSystems` order.
   */
  systems: z
    .array(
      z.object({
        codeSystem: overrideSystemSchema,
        publishedEntries: z.number().int().nonnegative(),
        draftEntries: z.number().int().nonnegative(),
        override: mappingInfo.omit({ method: true, confidence: true }).nullable(),
      }),
    )
    .default([]),
})
export type StateCategories = z.infer<typeof stateCategoriesResponseSchema>
