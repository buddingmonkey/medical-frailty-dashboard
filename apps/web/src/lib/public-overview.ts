import { publicOverviewResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'

import { getJson } from './api'

/** `GET /api/public/overview`: every state against every published unified category. */
export function usePublicOverview() {
  return useQuery({
    queryKey: ['public', 'overview'],
    queryFn: () => getJson('/api/public/overview', publicOverviewResponseSchema),
    staleTime: 5 * 60 * 1000,
  })
}
