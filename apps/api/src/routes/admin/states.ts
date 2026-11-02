import { stateListResponseSchema } from '@mfcd/shared'
import { asc } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { states } from '../../db/schema'
import type { AppEnv } from '../../types'

// Mounted behind requireAdmin. The state picker for uploads and watch items.
export const adminStates = new Hono<AppEnv>().get('/', async (c) => {
  const rows = await createDb(c.env.DB)
    .select({ id: states.id, name: states.name, status: states.status })
    .from(states)
    .orderBy(asc(states.name))
  return c.json(stateListResponseSchema.parse({ items: rows }))
})
