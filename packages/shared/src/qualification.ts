import {
  type Qualification,
  type QualificationBasis,
  qualificationBases,
  qualifications,
} from './enums'

// Badge labels and help text, in one file (docs/data-model.md, "Provisional"). The legal team
// may reword or remove them; change them here, not in components. Wording is provisional.

export const qualificationLabels: Record<Qualification, string> = {
  standalone: 'Qualifies alone',
  needs_support: 'Needs another code',
  supporting_only: 'Supporting evidence only',
  unknown: 'State doesn’t say',
}

export const qualificationHelp: Record<Qualification, string> = {
  standalone: 'A matching claim is enough.',
  needs_support: 'Counts only together with another code or documentation.',
  supporting_only: 'Evidence that supports another code; never enough alone.',
  unknown: 'The state does not say whether this code is enough on its own.',
}

export const qualificationBasisLabels: Record<QualificationBasis, string> = {
  published: 'The state says so',
  inferred: 'Inferred by us',
}

/** Every value, in display order. */
export const qualificationOptions = qualifications
export const qualificationBasisOptions = qualificationBases
