import {
  type MappingBasis,
  type MappingConfidence,
  type MappingRelation,
  type UnifiedStatus,
} from '@mfcd/shared'

// Words for the unified category admin pages (roadmap M5 step 3). The match words are on the
// legal team's review list (docs/status.md); admin pages only for now.

export const unifiedStatusLabels: Record<UnifiedStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  retired: 'Retired',
}

/** Pill classes per status, from the existing badge tokens. */
export const unifiedStatusClasses: Record<UnifiedStatus, string> = {
  draft: 'bg-badge-unknown-bg text-badge-unknown',
  published: 'bg-badge-alone-bg text-badge-alone',
  retired: 'bg-badge-needs-bg text-badge-needs',
}

export const relationLabels: Record<MappingRelation, string> = {
  exact: 'Exact',
  close: 'Close',
  broad: 'Broad',
  narrow: 'Narrow',
  related: 'Related',
  by_code: 'By code',
}

/** Plain-language meaning of each relation, shown beside the control. */
export const relationHelp: Record<Exclude<MappingRelation, 'by_code'>, string> = {
  exact: 'the same set of codes',
  close: 'nearly the same set of codes',
  broad: 'the unified category is wider than the state’s',
  narrow: 'the unified category is narrower than the state’s',
  related: 'the two overlap',
}

export const targetRelations = ['exact', 'close', 'broad', 'narrow', 'related'] as const

export const basisLabels: Record<MappingBasis, string> = {
  state_text: 'The state’s own text',
  admin_judgement: 'Admin judgement',
  ccsr_agreement: 'The codes’ CCSR groups agree',
  inferred: 'Inferred',
}

export const confidenceLabels: Record<MappingConfidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** A state category's name as the state wrote it; `(no category)` for ''. */
export function stateCategoryName(c: { stateCategory: string; stateSubcategory: string }): string {
  return [c.stateCategory || '(no category)', c.stateSubcategory].filter(Boolean).join(' / ')
}

export const percent = (share: number) => `${String(Math.round(share * 100))}%`
