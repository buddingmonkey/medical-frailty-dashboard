import { z } from 'zod'

// Allowed values for the enum-like columns in D1 (docs/data-model.md). The Drizzle schema in
// apps/api builds its CHECK constraints from these arrays, so the database, the API and the
// browser share one list. Adding a value needs a migration; removing one needs a data check.

/** The coding standard a code belongs to (glossary: "code system"). */
export const codeSystems = [
  'icd10cm',
  'icd10pcs',
  'cpt',
  'hcpcs',
  'ndc',
  'revenue',
  'other',
] as const
export const codeSystemSchema = z.enum(codeSystems)
export type CodeSystem = z.infer<typeof codeSystemSchema>

/** How an entry matches codes: one code, everything under a prefix, or a range of codes. */
export const matchKinds = ['exact', 'prefix', 'range'] as const
export const matchKindSchema = z.enum(matchKinds)
export type MatchKind = z.infer<typeof matchKindSchema>

/** Whether a listed code counts on its own (docs/data-model.md, "Qualification"). */
export const qualifications = ['standalone', 'needs_support', 'supporting_only', 'unknown'] as const
export const qualificationSchema = z.enum(qualifications)
export type Qualification = z.infer<typeof qualificationSchema>

/** `published`: the state's document says it. `inferred`: we deduced it; shown with a label. */
export const qualificationBases = ['published', 'inferred'] as const
export const qualificationBasisSchema = z.enum(qualificationBases)
export type QualificationBasis = z.infer<typeof qualificationBasisSchema>

export const stateStatuses = ['none', 'announced', 'published'] as const
export const stateStatusSchema = z.enum(stateStatuses)
export type StateStatus = z.infer<typeof stateStatusSchema>

export const versionStatuses = ['draft', 'published', 'superseded', 'discarded'] as const
export const versionStatusSchema = z.enum(versionStatuses)
export type VersionStatus = z.infer<typeof versionStatusSchema>

/**
 * Federal categories, in display order: the five groups in H.R.1 §71119's medically frail
 * definition, then `state_specific` (fits none of them) and `unmapped` (not yet reviewed;
 * shown publicly as "Unclassified").
 */
export const federalCategories = [
  'blind_or_disabled',
  'sud',
  'disabling_mental_disorder',
  'physical_idd_adl',
  'serious_complex_medical',
  'state_specific',
  'unmapped',
] as const
export const federalCategorySchema = z.enum(federalCategories)
export type FederalCategory = z.infer<typeof federalCategorySchema>

/** How a state category got its federal category. */
export const mappingMethods = ['auto', 'manual'] as const
export const mappingMethodSchema = z.enum(mappingMethods)
export type MappingMethod = z.infer<typeof mappingMethodSchema>

/** Watch dates (docs/data-model.md, "Watch dates"). */
export const watchKinds = ['court', 'federal', 'state_list', 'internal'] as const
export const watchKindSchema = z.enum(watchKinds)
export type WatchKind = z.infer<typeof watchKindSchema>

export const watchStatuses = ['open', 'done', 'dismissed'] as const
export const watchStatusSchema = z.enum(watchStatuses)
export type WatchStatus = z.infer<typeof watchStatusSchema>
