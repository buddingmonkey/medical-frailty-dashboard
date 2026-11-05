import { errorBodySchema } from '@mfcd/shared'
import type { z } from 'zod'

/**
 * A non-2xx API response. `message` is the API's `error` text when it sent one; `retryable` is
 * true when the API said the database was busy and the same request may work after a wait.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Calls a same-origin API route and validates the JSON body with a shared zod schema. */
export async function apiRequest<T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  const res = await fetch(url, { ...init, headers })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = errorBodySchema.safeParse(body)
    throw error.success
      ? new ApiError(res.status, error.data.error, error.data.retryable === true)
      : new ApiError(res.status, res.statusText)
  }
  return schema.parse(body)
}

export function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  return apiRequest(url, schema)
}

/** POST or PUT a JSON body (admin writes must be JSON; docs/security.md). */
export function sendJson<T>(
  method: 'POST' | 'PUT',
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return apiRequest(url, schema, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
