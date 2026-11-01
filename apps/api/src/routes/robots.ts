import { Hono } from 'hono'

import { isPublic } from '../middleware/site-gate'
import type { AppEnv } from '../types'

// Before launch: keep every crawler out. After launch: the public pages may be indexed; admin
// pages and the JSON API may not (crawling the API would only burn the free request quota).
// Add a `Sitemap:` line when the site has a custom domain and a sitemap (roadmap M7).
const PRIVATE = `# Medical Frailty Coding Dashboard is not public yet.
User-agent: *
Disallow: /
`

const PUBLIC = `# Medical Frailty Coding Dashboard
# Public pages may be crawled. Admin pages and the JSON API may not.
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
`

export const robots = new Hono<AppEnv>().get('/', (c) => {
  // Short cache so going live (or private again) takes effect within minutes.
  c.header('Cache-Control', 'public, max-age=300')
  return c.text(isPublic(c.env) ? PUBLIC : PRIVATE)
})
