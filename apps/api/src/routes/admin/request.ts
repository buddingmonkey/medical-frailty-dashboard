import { idParamSchema, stateIdSchema } from '@mfcd/shared'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'

import type { Db } from '../../db/client'
import { states } from '../../db/schema'
import type { AppEnv } from '../../types'

// Small helpers every admin route shares (mounted behind requireAdmin, which sets the identity).

/** The signed-in admin's email for audit rows and `created_by` columns; '' if none was set. */
export const actorOf = (c: Context<AppEnv>): string => c.var.identity?.email ?? ''

/** The answer to a malformed route param, and to an id or state that does not exist. */
export const notFound = (c: Context<AppEnv>) => c.json({ error: 'Not found' }, 404)

/** The numeric id in route param `name` (`idParamSchema`), or null when it is malformed. */
export function idParam(c: Context<AppEnv>, name = 'id'): number | null {
  const parsed = idParamSchema.safeParse(c.req.param(name))
  return parsed.success ? parsed.data : null
}

/** The state id in route param `name` (`stateIdSchema`), or null when it is malformed. */
export function stateParam(c: Context<AppEnv>, name = 'stateId'): string | null {
  const parsed = stateIdSchema.safeParse(c.req.param(name))
  return parsed.success ? parsed.data : null
}

/** The state named by the `stateId` route param, or undefined when malformed or unknown. */
export async function findStateParam(db: Db, c: Context<AppEnv>) {
  const id = stateParam(c)
  if (id === null) return undefined
  const [state] = await db
    .select({ id: states.id, publishedVersionId: states.publishedVersionId })
    .from(states)
    .where(eq(states.id, id))
  return state
}
