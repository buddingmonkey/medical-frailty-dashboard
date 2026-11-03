import type { Qualification } from '@mfcd/shared'

/** Badge colours per rule (tokens in src/styles/main.css), for badges and rule counts alike. */
export const qualificationColours: Record<Qualification, string> = {
  standalone: 'bg-badge-alone-bg text-badge-alone',
  needs_support: 'bg-badge-needs-bg text-badge-needs',
  supporting_only: 'bg-badge-support-bg text-badge-support',
  unknown: 'bg-badge-unknown-bg text-badge-unknown',
}
