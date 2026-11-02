import {
  formatCount,
  publicStateDetailResponseSchema,
  type PublicStateSummary,
  publicStatesResponseSchema,
  stateStatusLabels,
} from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { getJson } from './api'

/** `GET /api/public/states`, shared by every page that shows the state list. */
export function usePublicStates() {
  return useQuery({
    queryKey: ['public', 'states'],
    queryFn: () => getJson('/api/public/states', publicStatesResponseSchema),
    staleTime: 5 * 60 * 1000,
  })
}

/** `GET /api/public/states/:slug`: one state's page. */
export function usePublicState(slug: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: ['public', 'state', slug],
    queryFn: () =>
      getJson(
        `/api/public/states/${encodeURIComponent(toValue(slug))}`,
        publicStateDetailResponseSchema,
      ),
    staleTime: 5 * 60 * 1000,
  })
}

/** The accessible name of a state on the map: name, status and entry count. */
export function stateLinkLabel(state: Pick<PublicStateSummary, 'name' | 'status' | 'published'>) {
  const status = stateStatusLabels[state.status].toLowerCase()
  return state.published
    ? `${state.name}: ${status}, ${formatCount(state.published.totalEntries)} entries`
    : `${state.name}: ${status}`
}
