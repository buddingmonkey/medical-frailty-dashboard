import type { z } from 'zod'

/** A non-2xx API response. `message` is the API's `error` text when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** GET a same-origin JSON endpoint and validate the body with a shared zod schema. */
export async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : res.statusText
    throw new ApiError(res.status, error)
  }
  return schema.parse(body)
}
