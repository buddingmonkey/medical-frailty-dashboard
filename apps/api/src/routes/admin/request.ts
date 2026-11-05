import type { Context } from 'hono'

import type { AppEnv } from '../../types'

// Small helpers every admin route shares (mounted behind requireAdmin, which sets the identity).

/** The signed-in admin's email for audit rows and `created_by` columns; '' if none was set. */
export const actorOf = (c: Context<AppEnv>): string => c.var.identity?.email ?? ''
