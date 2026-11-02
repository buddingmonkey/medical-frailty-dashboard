import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

/** Drizzle over the Worker's D1 binding, with the schema for typed queries. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>
