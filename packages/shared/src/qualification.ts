import {
  type Qualification,
  type QualificationBasis,
  qualificationBases,
  qualifications,
} from './enums'

// Badge labels and help text, in one file (docs/data-model.md, "Provisional"). The legal team
// may reword or remove them; change them here, not in components. Wording is provisional.

// They describe the state's rule for a code, never whether a member is eligible (M6 step 3b).

export const qualificationLabels: Record<Qualification, string> = {
  standalone: 'Enough by itself',
  needs_support: 'Needs another code or documentation',
  supporting_only: 'Supporting only',
  unknown: 'State doesn’t say',
}

export const qualificationHelp: Record<Qualification, string> = {
  standalone: 'The state’s list says this code, by itself, meets its medically frail criteria.',
  needs_support: 'The state says this code counts only with another listed code or documentation.',
  supporting_only: 'The state treats this code as supporting evidence; it never counts by itself.',
  unknown: 'The state’s document does not say whether this code is enough by itself.',
}

export const qualificationBasisLabels: Record<QualificationBasis, string> = {
  published: 'Stated by the state',
  inferred: 'Inferred by this site from the state’s documents (not stated by the state)',
}

/** The heading over a state's rules (tables, counts, columns). */
export const RULE_HEADING = 'State’s rule'

/** Every value, in display order. */
export const qualificationOptions = qualifications
export const qualificationBasisOptions = qualificationBases
