import { codeSearchResponseSchema, type SearchPageQuery, searchPageParams } from '@mfcd/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { apiRequest } from '../lib/api'

/**
 * `GET /api/public/codes/search` (M6 step 1) for the search page. Null asks nothing. Each search
 * has its own query key, so a slow answer to an older search is stored under that search and
 * never shown for a newer one; TanStack aborts it (`signal`) when nothing watches it any more.
 * The previous results stay on screen while the next ones load.
 */
export function useCodeSearch(query: MaybeRefOrGetter<SearchPageQuery | null>) {
  const key = computed(() => {
    const q = toValue(query)
    return q ? searchPageParams(q) : null
  })
  return useQuery({
    queryKey: ['public', 'codeSearch', key],
    enabled: computed(() => key.value !== null),
    queryFn: ({ signal }) =>
      apiRequest(
        `/api/public/codes/search?${new URLSearchParams(key.value ?? {}).toString()}`,
        codeSearchResponseSchema,
        { signal },
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
