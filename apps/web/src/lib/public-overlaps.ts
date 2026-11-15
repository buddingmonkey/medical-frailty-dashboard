import { overlapsResponseSchema } from '@mfcd/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { getJson } from './api'

/** `GET /api/public/overlaps?category=`: one category's overlaps; waits for a category. */
export function useOverlaps(slug: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: ['public', 'overlaps', slug],
    enabled: computed(() => toValue(slug) !== ''),
    queryFn: () =>
      getJson(
        `/api/public/overlaps?category=${encodeURIComponent(toValue(slug))}`,
        overlapsResponseSchema,
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
