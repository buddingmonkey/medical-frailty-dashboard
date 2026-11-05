import {
  adminErrorMessage,
  classifyServerError,
  coverageStaleWarning,
  errorReferenceSchema,
  publicErrorMessage,
} from '@mfcd/shared'
import type { Context } from 'hono'

import type { AppEnv } from '../types'

/** The request's cf-ray when it has a usable one, else a short random id. */
function errorReference(c: Context<AppEnv>): string {
  const ray = errorReferenceSchema.safeParse(c.req.header('cf-ray'))
  return ray.success ? ray.data : crypto.randomUUID().slice(0, 8)
}

/**
 * `app.onError`: one JSON log line with a reference, and a 500. Admin routes (behind Access)
 * get a plain-language message for the D1 failures an admin can hit, with the reference to quote
 * (texts in packages/shared/src/errors.ts). Every other route keeps the generic text, so no
 * internals reach the public. The log holds the error message, method and path only: no body.
 */
export function onServerError(err: Error, c: Context<AppEnv>): Response {
  const ref = errorReference(c)
  console.error(
    JSON.stringify({
      level: 'error',
      message: err.message,
      method: c.req.method,
      path: c.req.path,
      ref,
    }),
  )
  const admin = c.req.path === '/api/admin' || c.req.path.startsWith('/api/admin/')
  const error = admin
    ? adminErrorMessage(classifyServerError(err.message), ref)
    : publicErrorMessage
  return c.json({ error }, 500)
}

/**
 * Runs the coverage recompute that follows a committed save (placements, pair similarity). The
 * save stands either way, so a failure here is logged with a reference and returned as the
 * answer's `warning` (Rebuild coverage repairs it) instead of a 500 that would read as "not
 * saved".
 */
export async function recomputeAfterSave(
  c: Context<AppEnv>,
  work: () => Promise<unknown>,
): Promise<{ warning?: string }> {
  try {
    await work()
    return {}
  } catch (err) {
    const ref = errorReference(c)
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'recompute.after-save',
        message: err instanceof Error ? err.message : String(err),
        method: c.req.method,
        path: c.req.path,
        ref,
      }),
    )
    return { warning: coverageStaleWarning(ref) }
  }
}
