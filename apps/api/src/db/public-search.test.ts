import { type CodeSearchQuery, parseSearchInput } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

import { seedSearch } from '../test/search-fixtures'
import { candidateStatements, detailStatements, type Statement } from './public-search'

// The cost rule for code search: a few indexed queries per request, never a scan of ref_codes
// (107k rows) or entries. Checked on the query plan of every statement the search can send.

const db = env.DB

async function plan(s: Statement): Promise<string[]> {
  const { results } = await db
    .prepare(`EXPLAIN QUERY PLAN ${s.sql}`)
    .bind(...s.params)
    .all<{ detail: string }>()
  return results.map((r) => r.detail)
}

const query = (q: string, more: Partial<CodeSearchQuery> = {}): CodeSearchQuery => ({
  q,
  states: [],
  system: null,
  limit: 20,
  ...more,
})

const CASES: [string, CodeSearchQuery][] = [
  ['a code prefix', query('F20')],
  ['a dotted code', query('F20.0')],
  ['a code in some states', query('F20', { states: ['ga', 'mt'] })],
  ['a code in one system', query('J12', { system: 'hcpcs' })],
  ['a CPT code', query('99213')],
  ['words', query('paranoid schizo')],
  ['words in some states', query('paranoid schizo', { states: ['ga'] })],
  ['words in one system', query('injection', { system: 'hcpcs' })],
  ['words in a system without CMS text', query('office visit', { system: 'cpt' })],
]

beforeAll(async () => {
  await seedSearch(db)
  await db.prepare('ANALYZE').run()
})

describe('code search query plans', () => {
  it.each(CASES)('never scans ref_codes or entries for %s', async (_, q) => {
    const statements = [
      ...candidateStatements(q, parseSearchInput(q.q)),
      ...detailStatements(['F200', 'J1234', '99213']),
    ]
    expect(statements.length).toBeGreaterThan(0)
    for (const s of statements) {
      const lines = await plan(s)
      for (const line of lines) {
        // `SCAN states` (51 rows), `SCAN json_each` and the CTE `m` are fine; a full-text
        // table must be read through MATCH (`INDEX 0:M…`).
        expect(line, s.sql).not.toMatch(/^SCAN (ref_codes|entries|e)$/)
        expect(line, s.sql).not.toMatch(/^SCAN (ref_codes|entries|e) /)
        if (/^SCAN (entries_fts|ref_codes_fts|f) /.test(line)) {
          expect(line, s.sql).toMatch(/VIRTUAL TABLE INDEX 0:M/)
        }
      }
      expect(lines.join('\n'), s.sql).toMatch(/SEARCH (ref_codes|e) |VIRTUAL TABLE INDEX 0:M/)
    }
  })

  it('sends at most three candidate statements', () => {
    for (const [, q] of CASES) {
      expect(candidateStatements(q, parseSearchInput(q.q)).length).toBeLessThanOrEqual(3)
    }
  })
})
