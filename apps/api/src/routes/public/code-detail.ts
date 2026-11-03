import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicCode } from '../../db/public-code'
import type { AppEnv } from '../../types'

// GET /api/public/codes/:system/:code (roadmap M6 step 3): one code and every state's status for
// it (src/db/public-code.ts). 404 for a malformed code, or one that is not in ref_codes and no
// published entry lists or covers, so the URL space stays finite. Cached on data_version
// (publicCache).

export const publicCodeDetailRoute = new Hono<AppEnv>().get('/:system/:code', async (c) => {
  const body = await publicCode(
    createDb(c.env.DB),
    c.req.param('system'),
    c.req.param('code'),
    c.get('dataVersion') ?? 0,
  )
  return body ? c.json(body) : c.json({ error: 'Not found' }, 404)
})
