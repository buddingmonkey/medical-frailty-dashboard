import { z } from 'zod'

// Launch readiness (roadmap M8 step 1): the data half of the launch gate. At least 2 states
// with a published list must have every category mapping confirmed. The usability gate (M8
// step 5) is the other half and is not tracked here.

/** How many ready states the launch data gate needs (project lead, 2026-11-01). */
export const LAUNCH_READY_STATES_REQUIRED = 2

const n = z.number().int().nonnegative()

/** One state with a published list. Counts are of its distinct state categories. */
export const launchReadinessStateSchema = z.object({
  stateId: z.string().regex(/^[A-Z]{2}$/),
  name: z.string(),
  versionId: z.number().int().positive(),
  versionNo: z.number().int().positive(),
  /** When the version was published (ISO timestamp), or null on rows without one. */
  publishedAt: z.string().nullable(),
  /** Distinct (state category, subcategory) pairs in the published version. */
  categories: n,
  /** Unified layer (`unified_mappings`), the one behind the public review status. */
  unified: z.object({
    /** No current (proposed or approved) mapping. */
    unmapped: n,
    /** A current mapping that is still proposed. */
    unconfirmed: n,
  }),
  /** Federal layer (`category_mappings`): shown for information only, not part of the gate. */
  federal: z.object({
    /** `unmapped`, or no row. */
    unmapped: n,
    /** Suggested automatically and never confirmed by hand. */
    auto: n,
  }),
  /** Categories the public state page shows as "Not yet reviewed (automatic suggestion)". */
  notReviewed: n,
  ready: z.boolean(),
})

export type LaunchReadinessState = z.infer<typeof launchReadinessStateSchema>

/** `GET /api/admin/launch-readiness`. */
export const launchReadinessResponseSchema = z.object({
  states: z.array(launchReadinessStateSchema),
  readyCount: n,
  required: z.literal(LAUNCH_READY_STATES_REQUIRED),
  gatePassed: z.boolean(),
})

export type LaunchReadinessResponse = z.infer<typeof launchReadinessResponseSchema>

/**
 * A state is ready when every category has an approved unified mapping and its public page
 * shows "Reviewed" for every category (`notReviewed` counts the public rule, so the two can
 * never disagree). The federal layer is information only.
 */
export function stateIsReady(c: {
  unified: { unmapped: number; unconfirmed: number }
  notReviewed: number
}): boolean {
  return c.unified.unmapped === 0 && c.unified.unconfirmed === 0 && c.notReviewed === 0
}

/** The top of the response: how many states are ready and whether the data gate passes. */
export function launchGate(states: readonly { ready: boolean }[]): {
  readyCount: number
  required: typeof LAUNCH_READY_STATES_REQUIRED
  gatePassed: boolean
} {
  const readyCount = states.filter((s) => s.ready).length
  return {
    readyCount,
    required: LAUNCH_READY_STATES_REQUIRED,
    gatePassed: readyCount >= LAUNCH_READY_STATES_REQUIRED,
  }
}
