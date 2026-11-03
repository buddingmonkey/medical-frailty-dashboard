import { codeSearchQuerySchema } from '@mfcd/shared'
import { Hono } from 'hono'

import { publicCodeSearch } from '../../db/public-search'
import type { AppEnv } from '../../types'

// GET /api/public/codes/search?q=&states=&system=&limit= (roadmap M6 step 1): every real code
// (ICD-10-CM and HCPCS from CMS, and every code a published state lists) by code prefix or by
// words, with the states that list each one. Indexed queries only (src/db/public-search.ts).
// Cached on data_version by the publicCache on /api/public/codes/* (src/app.ts).

/** `system=` and `limit=` left empty by a form mean the default. */
const blankToUndefined = (value: string | undefined) => (value === '' ? undefined : value)

export const publicCodeSearchRoute = new Hono<AppEnv>().get('/', async (c) => {
  const parsed = codeSearchQuerySchema.safeParse({
    q: c.req.query('q'),
    states: c.req.query('states'),
    system: blankToUndefined(c.req.query('system')),
    limit: blankToUndefined(c.req.query('limit')),
  })
  if (!parsed.success) return c.json({ error: 'Invalid search', issues: parsed.error.issues }, 400)
  const body = await publicCodeSearch(c.env.DB, parsed.data, c.get('dataVersion') ?? 0)
  return body ? c.json(body) : c.json({ error: 'Unknown state' }, 400)
})
