import { type WatchItem, watchListResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'

import { getJson } from './api'

export const watchKindLabels: Record<WatchItem['kind'], string> = {
  court: 'Court',
  federal: 'Federal',
  state_list: 'State list',
  internal: 'Internal',
}

/** Open watch items; shared by the admin banner and the watch page (one request). */
export function useWatchItems(status: 'open' | 'closed', enabled: () => boolean = () => true) {
  return useQuery({
    queryKey: ['admin', 'watch', status],
    queryFn: async () =>
      (await getJson(`/api/admin/watch?status=${status}`, watchListResponseSchema)).items,
    enabled,
    staleTime: 60_000,
  })
}

/** Today in the admin's own time zone, `YYYY-MM-DD`. */
export function localToday(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

const localDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/**
 * An ISO timestamp (`2026-11-02T04:30:00Z`) as a date in the reader's own time zone. Never
 * slice the timestamp to its UTC date: in the US evening that is already tomorrow.
 */
export function formatTimestampDate(timestamp: string): string {
  return localDateFormat.format(new Date(timestamp))
}

/** `2026-12-28` → "Dec 28, 2026" (in the reader's locale). A calendar date, no time zone. */
export function formatIsoDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`))
}
