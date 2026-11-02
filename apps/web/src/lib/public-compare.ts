import {
  type CodeSystem,
  type CompareQuery,
  compareQuerySchema,
  compareResponseSchema,
  compareSearchParams,
  type FederalCategory,
} from '@mfcd/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { LocationQuery } from 'vue-router'

import { getJson } from './api'

// The compare page's selection, its URL and its API call (roadmap M4 step 2).

/** What the controls edit. Unlike `CompareQuery`, it may be incomplete. */
export interface CompareSelection {
  mode: 'federal' | 'own'
  category: FederalCategory | ''
  ownState: string
  /** Null until one is chosen ('' is a real category: the state's "(no category)"). */
  ownCategory: string | null
  ownSubcategory: string
  /** The other states, in the order they were picked. */
  states: string[]
  system: CodeSystem | ''
  alone: boolean
}

export const emptySelection = (): CompareSelection => ({
  mode: 'federal',
  category: '',
  ownState: '',
  ownCategory: null,
  ownSubcategory: '',
  states: [],
  system: '',
  alone: false,
})

/** The route's query as `CompareQuery`, or null when it is missing or invalid. */
export function queryFromRoute(query: LocationQuery): CompareQuery | null {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === 'string') flat[key] = first
  }
  const parsed = compareQuerySchema.safeParse(flat)
  return parsed.success ? parsed.data : null
}

/** The selection as a query (page 1), or null while it is incomplete. */
export function queryFromSelection(s: CompareSelection): CompareQuery | null {
  const raw: Record<string, string> =
    s.mode === 'federal'
      ? { states: s.states.join(','), category: s.category }
      : {
          states: [s.ownState, ...s.states].join(','),
          ownState: s.ownState,
          ownCategory: s.ownCategory ?? '',
          ownSubcategory: s.ownSubcategory,
        }
  if (s.system !== '') raw['system'] = s.system
  if (s.alone) raw['alone'] = '1'
  if (s.mode === 'federal' && s.category === '') return null
  if (s.mode === 'own' && (s.ownState === '' || s.ownCategory === null)) return null
  const parsed = compareQuerySchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function selectionFromQuery(q: CompareQuery): CompareSelection {
  const own = q.ownState
  return {
    mode: own === undefined ? 'federal' : 'own',
    category: q.category ?? '',
    ownState: own ?? '',
    ownCategory: q.ownCategory ?? null,
    ownSubcategory: q.ownSubcategory,
    states: own === undefined ? q.states : q.states.filter((id) => id !== own),
    system: q.system ?? '',
    alone: q.alone,
  }
}

/** The URL query for a selection, page left out. */
export const selectionKey = (q: CompareQuery) => compareSearchParams({ ...q, page: 1 }).toString()

/** `GET /api/public/compare`; keeps the last page on screen while the next one loads. */
export function useCompare(query: MaybeRefOrGetter<CompareQuery | null>) {
  const params = computed(() => {
    const q = toValue(query)
    return q ? compareSearchParams(q).toString() : null
  })
  return useQuery({
    queryKey: ['public', 'compare', params],
    queryFn: () => getJson(`/api/public/compare?${params.value ?? ''}`, compareResponseSchema),
    enabled: computed(() => params.value !== null),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
