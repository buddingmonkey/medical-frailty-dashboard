import { type PublicStateSummary, publicStatesResponseSchema, type StateStatus } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'

import { getJson } from './api'

/** `GET /api/public/states`, shared by every page that shows the state list. */
export function usePublicStates() {
  return useQuery({
    queryKey: ['public', 'states'],
    queryFn: () => getJson('/api/public/states', publicStatesResponseSchema),
    staleTime: 5 * 60 * 1000,
  })
}

/** Status words for people, not the database: "published" means published on this site. */
export const stateStatusLabels: Record<StateStatus, string> = {
  published: 'List on this site',
  announced: 'List announced, not on this site yet',
  none: 'No list yet',
}

export const formatCount = (n: number) => n.toLocaleString('en-US')

/** `2026-09-15` → "September 15, 2026", read as a calendar date (no time zone shift). */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** The accessible name of a state on the map: name, status and entry count. */
export function stateLinkLabel(state: Pick<PublicStateSummary, 'name' | 'status' | 'published'>) {
  const status = stateStatusLabels[state.status].toLowerCase()
  return state.published
    ? `${state.name}: ${status}, ${formatCount(state.published.totalEntries)} entries`
    : `${state.name}: ${status}`
}
