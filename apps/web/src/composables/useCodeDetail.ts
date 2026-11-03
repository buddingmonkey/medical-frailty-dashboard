import { codeDetailResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { getJson } from '../lib/api'

/** `GET /api/public/codes/:system/:code`: one code and every state's status (M6 step 3). */
export function useCodeDetail(system: MaybeRefOrGetter<string>, code: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: ['public', 'code', system, code],
    queryFn: () =>
      getJson(
        `/api/public/codes/${encodeURIComponent(toValue(system))}/${encodeURIComponent(toValue(code))}`,
        codeDetailResponseSchema,
      ),
    staleTime: 5 * 60 * 1000,
  })
}
