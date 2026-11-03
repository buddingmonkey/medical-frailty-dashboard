import {
  drillDetailResponseSchema,
  type DrillQuery,
  drillResponseSchema,
  drillSearchParams,
} from '@mfcd/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { getJson } from './api'

// The category drill-down's API calls (roadmap M5 step 6). The page's own data leaves out the
// open code, so opening details never reloads the table.

/** `GET /api/public/categories/:slug`: one page of groups. */
export function useDrill(slug: MaybeRefOrGetter<string>, query: MaybeRefOrGetter<DrillQuery>) {
  const search = computed(() => drillSearchParams({ ...toValue(query), code: null }).toString())
  return useQuery({
    queryKey: ['public', 'drill', slug, search],
    queryFn: () =>
      getJson(
        `/api/public/categories/${encodeURIComponent(toValue(slug))}${search.value === '' ? '' : `?${search.value}`}`,
        drillResponseSchema,
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}

/** `GET /api/public/categories/:slug/detail?code=`: every state for one row; waits for a code. */
export function useDrillDetail(
  slug: MaybeRefOrGetter<string>,
  code: MaybeRefOrGetter<string | null>,
) {
  return useQuery({
    queryKey: ['public', 'drill-detail', slug, code],
    enabled: computed(() => toValue(code) !== null),
    queryFn: () =>
      getJson(
        `/api/public/categories/${encodeURIComponent(toValue(slug))}/detail?code=${encodeURIComponent(toValue(code) ?? '')}`,
        drillDetailResponseSchema,
      ),
    staleTime: 5 * 60 * 1000,
  })
}
