import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { includedCodesSql } from './public-code-sitemap'

// The sitemap's cost rule (M6 step 5): the cover joins must be range searches of ref_codes'
// primary key, never a scan of its 107k rows. Left to itself the planner once chose a scan
// (24 s on the local seed); the CROSS JOIN order in public-code-sitemap.ts prevents that.
describe('sitemap code query plan', () => {
  it('searches ref_codes by its key and never scans it', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN ${includedCodesSql} SELECT count(*) FROM codes`,
    ).all<{ detail: string }>()
    const details = results.map((r) => r.detail)
    expect(details.filter((d) => d.startsWith('SEARCH r ')).length).toBe(2)
    expect(details.filter((d) => /^SCAN r\b/.test(d))).toEqual([])
  })
})
