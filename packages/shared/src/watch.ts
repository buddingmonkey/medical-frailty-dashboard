import { z } from 'zod'

import { watchKindSchema, watchStatusSchema } from './enums'

// Watch dates: deadlines and re-check dates the admins must act on (docs/data-model.md,
// "Watch dates"). Dates are ISO `YYYY-MM-DD` text, compared as strings.

/** Items due within this many days (today included) are "due soon". */
export const WATCH_DUE_SOON_DAYS = 14

const isoDate = z.iso.date()
const note = z.string().trim().min(1).max(4000)

/** A source link. Only http(s), so a stored link can never run script when clicked. */
export const watchLinkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.url({ protocol: /^https?$/ }).max(2000),
})

export type WatchLink = z.infer<typeof watchLinkSchema>

const watchFields = {
  title: z.string().trim().min(1).max(200),
  kind: watchKindSchema,
  /** Upper-case postal code of a state already in `states`, or null. */
  stateId: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .default(null),
  dueDate: isoDate.nullable().default(null),
  /** The date is an estimate (e.g. an appeal window before the judgment date is known). */
  dateIsApproximate: z.boolean().default(false),
  /** Why it matters. Shown as plain text. */
  whyMd: note,
  links: z.array(watchLinkSchema).max(10).default([]),
  /** Closing the item creates the next one this many days later. */
  repeatDays: z.number().int().min(1).max(3650).nullable().default(null),
}

/** Body of `POST /api/admin/watch`. */
export const watchCreateSchema = z.object(watchFields)

export type WatchCreate = z.infer<typeof watchCreateSchema>
export type WatchCreateInput = z.input<typeof watchCreateSchema>

/** Body of `PUT /api/admin/watch/:id`: edit every field, or close with a resolution note. */
export const watchUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), ...watchFields }),
  z.object({
    action: z.literal('close'),
    status: z.enum(['done', 'dismissed']),
    resolutionMd: note,
  }),
])

export type WatchUpdate = z.infer<typeof watchUpdateSchema>
export type WatchUpdateInput = z.input<typeof watchUpdateSchema>

/** Query of `GET /api/admin/watch`: open items, or closed ones (the History tab). */
export const watchListQuerySchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
})

export const watchItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  kind: watchKindSchema,
  stateId: z.string().nullable(),
  dueDate: isoDate.nullable(),
  dateIsApproximate: z.boolean(),
  whyMd: z.string(),
  links: z.array(watchLinkSchema),
  repeatDays: z.number().int().positive().nullable(),
  status: watchStatusSchema,
  resolutionMd: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export type WatchItem = z.infer<typeof watchItemSchema>

/** Body of `GET /api/admin/watch`. */
export const watchListResponseSchema = z.object({ items: z.array(watchItemSchema) })

export type WatchListResponse = z.infer<typeof watchListResponseSchema>

/** `date` plus `days`, as `YYYY-MM-DD`. Calendar arithmetic in UTC, so no DST surprises. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface WatchGroups<T> {
  overdue: T[]
  dueSoon: T[]
  later: T[]
  noDate: T[]
}

/** Splits open items into the page's four groups, each sorted by due date (then id). */
export function groupWatchItems<T extends { id: number; dueDate: string | null }>(
  items: readonly T[],
  today: string,
): WatchGroups<T> {
  const soonEnd = addDays(today, WATCH_DUE_SOON_DAYS)
  const sorted = [...items].sort(
    (a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.id - b.id,
  )
  const groups: WatchGroups<T> = { overdue: [], dueSoon: [], later: [], noDate: [] }
  for (const item of sorted) {
    if (item.dueDate === null) groups.noDate.push(item)
    else if (item.dueDate < today) groups.overdue.push(item)
    else if (item.dueDate <= soonEnd) groups.dueSoon.push(item)
    else groups.later.push(item)
  }
  return groups
}

/**
 * Due date of the item a repeating item creates when it is closed: `repeatDays` after its due
 * date, or after the close date if there was no due date or that would already have passed.
 */
export function nextRepeatDate(
  dueDate: string | null,
  closedOn: string,
  repeatDays: number,
): string {
  const fromDue = dueDate === null ? null : addDays(dueDate, repeatDays)
  return fromDue !== null && fromDue > closedOn ? fromDue : addDays(closedOn, repeatDays)
}
