import { z } from 'zod'

// Server errors as admins see them (apps/api/src/middleware/errors.ts). Public routes always
// answer "Internal error": they never say what failed inside. Admin routes say what happened in
// plain words, what to do, and a reference to quote: the request's cf-ray, or a short id. The
// same reference is in the error log line, so a report can be matched to it.

/** The text public routes (and anything outside /api/admin) send for an unexpected error. */
export const publicErrorMessage = 'Internal error'

/** A cf-ray value (`8f2a1c3d4e5f6a7b-DFW`) or a generated short id: letters, digits, `-`. */
export const errorReferenceSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/)

export type ServerErrorKind = 'too-long' | 'too-many-values' | 'busy' | 'unknown'

/**
 * Sorts an error message by what the admin can do about it. D1 wraps its failures as
 * `D1_ERROR: …`; the texts below are the ones Cloudflare documents or we have seen in the logs.
 * A D1 batch is one transaction, so in every D1 case nothing of the failed statement or batch
 * was saved.
 */
export function classifyServerError(message: string): ServerErrorKind {
  if (/CPU time limit|exceeded timeout|was reset/i.test(message)) return 'too-long'
  if (/too many SQL variables/i.test(message)) return 'too-many-values'
  if (
    /overloaded|queued for too long|too many requests queued|network connection lost/i.test(message)
  ) {
    return 'busy'
  }
  return 'unknown'
}

const unfinished = 'Nothing was saved from the unfinished step.'

const adminErrorTexts: Record<ServerErrorKind, (reference: string) => string> = {
  'too-long': (ref) =>
    `The database took too long on this step and stopped it. ${unfinished} Try again; if it keeps failing, report it with reference ${ref}.`,
  'too-many-values': (ref) =>
    `This step sent the database more values at once than it accepts. ${unfinished} Trying again will not help; report it with reference ${ref}.`,
  busy: (ref) =>
    `The database was busy, or the connection to it dropped. ${unfinished} Wait a minute and try again; if it keeps failing, report it with reference ${ref}.`,
  unknown: (ref) =>
    `Something went wrong on the server. Try again; if it keeps failing, report it with reference ${ref}.`,
}

/** The `error` text of a 500 on an admin route. */
export function adminErrorMessage(kind: ServerErrorKind, reference: string): string {
  return adminErrorTexts[kind](reference)
}

/**
 * A save whose own batch committed, but whose coverage recompute after it failed (placements,
 * pair similarity): the answer is a success with this `warning`, never a 500, because a retry
 * would meet the saved change ("Only a draft can be published").
 */
export function coverageStaleWarning(reference: string): string {
  return `Saved. Coverage could not be updated; press Rebuild coverage on Admin → Unified categories. If that fails too, report it with reference ${reference}.`
}

/** The `warning` field of a save's answer: set only when the recompute after it failed. */
export const saveWarningSchema = z.string().min(1).optional()
