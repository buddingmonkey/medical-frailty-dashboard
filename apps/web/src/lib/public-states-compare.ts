import {
  statesCompareApiPath,
  type StatesCompareQuery,
  statesCompareResponseSchema,
} from '@mfcd/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { getJson } from './api'

// Compare 2–4 states (roadmap M5 step 7): `GET /api/public/states-compare`. Waits while the
// address is not a comparison (`ids` null).

export function useStatesCompare(
  ids: MaybeRefOrGetter<readonly string[] | null>,
  query: MaybeRefOrGetter<StatesCompareQuery>,
) {
  const path = computed(() => {
    const chosen = toValue(ids)
    return chosen === null ? null : statesCompareApiPath(chosen, toValue(query))
  })
  return useQuery({
    queryKey: ['public', 'states-compare', path],
    enabled: computed(() => path.value !== null),
    queryFn: () => getJson(path.value ?? '', statesCompareResponseSchema),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
