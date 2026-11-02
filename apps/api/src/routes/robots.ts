import { Hono } from 'hono'

import { isPublic } from '../middleware/site-gate'
import type { AppEnv } from '../types'

// Before launch: keep every crawler out. After launch: every crawler, AI crawlers included, is
// welcome on the public pages (docs/seo.md); admin pages and the JSON API are off limits
// (crawling the API would only burn the free request quota; data downloads are linked from
// pages instead). Content-Signal follows https://contentsignals.org: search, AI answers and
// AI training are all allowed (project lead, 2026-11-01).
// Add a `Sitemap:` line when the site has a sitemap and its final domain (roadmap M8).
const PRIVATE = `# Medical Frailty Coding Dashboard is not public yet.
User-agent: *
Disallow: /
`

const PUBLIC = `# Medical Frailty Coding Dashboard
# Public state policy data. All crawlers, AI crawlers included, are welcome on public pages.
# Admin pages and the JSON API are off limits.
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /
Disallow: /admin
Disallow: /api/
`

export const robots = new Hono<AppEnv>().get('/', (c) => {
  // Short cache so going live (or private again) takes effect within minutes.
  c.header('Cache-Control', 'public, max-age=300')
  return c.text(isPublic(c.env) ? PUBLIC : PRIVATE)
})
