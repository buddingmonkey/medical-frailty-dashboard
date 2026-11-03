import { z } from 'zod'

// Allowed values for the enum-like columns in D1 (docs/data-model.md). The Drizzle schema in
// apps/api builds its CHECK constraints from these arrays, so the database, the API and the
// browser share one list. Adding a value needs a migration; removing one needs a data check.

/**
 * The coding standard a code belongs to (glossary: "code system"). `drug_class`: the 3-character
 * therapeutic class codes on LA's pharmacy rows (`H2G`); they share a shape with ICD-10-CM
 * categories, so only the source's column or section can set it (docs/sources.md, Louisiana).
 */
export const codeSystems = [
  'icd10cm',
  'icd10pcs',
  'cpt',
  'hcpcs',
  'ndc',
  'revenue',
  'drug_class',
  'other',
] as const
export const codeSystemSchema = z.enum(codeSystems)
export type CodeSystem = z.infer<typeof codeSystemSchema>

/** Display names. CPT is the AMA's name; we never show AMA descriptors (docs/data-model.md). */
export const codeSystemLabels: Record<CodeSystem, string> = {
  icd10cm: 'ICD-10-CM',
  icd10pcs: 'ICD-10-PCS',
  cpt: 'CPT',
  hcpcs: 'HCPCS Level II',
  ndc: 'NDC',
  revenue: 'Revenue code',
  drug_class: 'Drug class',
  other: 'Other',
}

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

// Unified categories (docs/data-model.md, "Unified categories (M5)").

/**
 * How a state category relates to a unified category (SKOS): `exact` the same set, `close`
 * nearly, `broad` the unified category is broader, `narrow` it is narrower, `related`.
 * `by_code`: the state category is not a meaningful group; each code goes by its CCSR group.
 */
export const mappingRelations = ['exact', 'close', 'broad', 'narrow', 'related', 'by_code'] as const
export const mappingRelationSchema = z.enum(mappingRelations)
export type MappingRelation = z.infer<typeof mappingRelationSchema>

/** Why a mapping holds: the state's own text, an admin's judgement, CCSR, or inferred. */
export const mappingBases = ['state_text', 'admin_judgement', 'ccsr_agreement', 'inferred'] as const
export const mappingBasisSchema = z.enum(mappingBases)
export type MappingBasis = z.infer<typeof mappingBasisSchema>

export const mappingConfidences = ['high', 'medium', 'low'] as const
export const mappingConfidenceSchema = z.enum(mappingConfidences)
export type MappingConfidence = z.infer<typeof mappingConfidenceSchema>

/** Public pages show `published` unified categories only; `retired` ones never count. */
export const unifiedStatuses = ['draft', 'published', 'retired'] as const
export const unifiedStatusSchema = z.enum(unifiedStatuses)
export type UnifiedStatus = z.infer<typeof unifiedStatusSchema>

/** Why an entry counts under a unified category: an approved mapping names it, or its CCSR group. */
export const placementBases = ['mapping', 'by_code'] as const
export const placementBasisSchema = z.enum(placementBases)
export type PlacementBasis = z.infer<typeof placementBasisSchema>

/** Mappings are never deleted: a change marks the old row `superseded`. */
export const unifiedMappingStatuses = ['proposed', 'approved', 'superseded'] as const
export const unifiedMappingStatusSchema = z.enum(unifiedMappingStatuses)
export type UnifiedMappingStatus = z.infer<typeof unifiedMappingStatusSchema>
