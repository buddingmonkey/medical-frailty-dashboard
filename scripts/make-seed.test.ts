import { describe, expect, it } from 'vitest'

import {
  assertIdsBelow,
  assertNoEmails,
  insertRowsSql,
  mappingSql,
  parseArgs,
  RESET_SQL,
  sampleEntries,
  scrub,
  SEED_ACTOR,
} from './make-seed'

type Entry = Parameters<typeof sampleEntries>[0][number]

const entry = (id: number, code: string, category = 'A', qualification = 'alone'): Entry => ({
  id,
  code_system: 'icd10cm',
  code_norm: code,
  state_category: category,
  state_subcategory: '',
  qualification,
})

describe('sampleEntries', () => {
  const list = [
    entry(1, 'F200'),
    entry(2, 'F201'),
    entry(3, 'F202'),
    entry(4, 'N186', 'B'),
    entry(5, 'N185', 'B'),
    entry(6, 'E0601', 'C', 'unknown'),
  ]
  const none = new Set<string>()

  it('takes preferred codes first, then groups not yet shown, then the rest', () => {
    const picked = sampleEntries(list, { preferred: new Set(['F202']), useful: none }, 4)
    // F202 is preferred; then B (N185 before N186) and C, then back to A.
    expect(picked.map((e) => e.id)).toEqual([3, 5, 6, 1])
  })

  it('puts useful codes (in a unified category) first within each group', () => {
    const picked = sampleEntries(list, { preferred: none, useful: new Set(['N186']) }, 3)
    expect(picked.map((e) => e.id)).toEqual([1, 4, 6])
  })

  it('spreads picks across the code range instead of taking the first codes', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry(i + 1, `F${String(200 + i)}`))
    const picked = sampleEntries(many, { preferred: none, useful: none }, 3)
    // Positions 0, 4 and 2 of 8: the start, the middle, the first quarter.
    expect(picked.map((e) => e.code_norm)).toEqual(['F200', 'F204', 'F202'])
  })

  it('keeps every entry when the list is smaller than the sample', () => {
    expect(sampleEntries(list, { preferred: none, useful: none }, 50)).toHaveLength(6)
  })

  it('gives the same sample for the same input, whatever the order', () => {
    const sets = { preferred: new Set(['N185']), useful: new Set(['F201']) }
    const a = sampleEntries(list, sets, 3).map((e) => e.id)
    const b = sampleEntries([...list].reverse(), sets, 3).map((e) => e.id)
    expect(a).toEqual(b)
  })

  it('caps the preferred codes at half the sample, so every group still shows', () => {
    const preferred = new Set(['F200', 'F201', 'F202'])
    expect(sampleEntries(list, { preferred, useful: none }, 4).map((e) => e.id)).toEqual([
      1, 2, 5, 6,
    ])
  })
})

describe('scrub', () => {
  it('replaces admin identities with the seed actor and leaves other columns and NULLs alone', () => {
    expect(
      scrub({ id: 1, uploaded_by: 'admin@example.org', title: 'List', reviewed_by: null }),
    ).toEqual({ id: 1, uploaded_by: SEED_ACTOR, title: 'List', reviewed_by: null })
  })
})

describe('assertNoEmails', () => {
  it('allows the seed actor only', () => {
    expect(() => {
      assertNoEmails(`INSERT ... '${SEED_ACTOR}'`)
    }).not.toThrow()
    expect(() => {
      assertNoEmails("INSERT ... 'someone@example.org'")
    }).toThrow(/email/)
  })
})

describe('RESET_SQL', () => {
  it('clears state data and derived rows, never reference data or states', () => {
    const sql = RESET_SQL.join('\n')
    for (const table of ['entries', 'dataset_versions', 'source_documents', 'unified_mappings'])
      expect(sql).toContain(`DELETE FROM ${table};`)
    expect(sql).not.toMatch(/DELETE FROM (ref_|states|unified_categories|watch_items)/)
    // Deleting a version while a state points at it would break the foreign key.
    expect(sql.indexOf('UPDATE states')).toBeLessThan(sql.indexOf('DELETE FROM dataset_versions'))
  })
})

describe('mappingSql', () => {
  const row = { id: 3, state_id: 'GA', unified_id: 12, relation: 'related' }

  it('finds the unified category by slug, since ids differ between databases', () => {
    expect(mappingSql(row, new Map([[12, 'cancer']]))).toBe(
      "INSERT INTO unified_mappings (id, state_id, relation, unified_id) SELECT 3, 'GA', 'related', id FROM unified_categories WHERE slug = 'cancer';",
    )
  })

  it('writes a by_code row (no target) as it is', () => {
    expect(mappingSql({ ...row, unified_id: null }, new Map())).toBe(
      "INSERT INTO unified_mappings (id, state_id, unified_id, relation) VALUES (3, 'GA', NULL, 'related');",
    )
  })

  it('refuses a target it has no slug for', () => {
    expect(() => mappingSql(row, new Map())).toThrow(/slug/)
  })
})

describe('parseArgs', () => {
  it('reads production with 300 entries per real state by default', () => {
    expect(parseArgs([])).toEqual({ from: 'production', perState: 300 })
    expect(parseArgs(['--from', 'preview', '--per-state', '50'])).toEqual({
      from: 'preview',
      perState: 50,
    })
    expect(() => parseArgs(['--from', 'local'])).toThrow(/--from/)
  })
})

describe('assertIdsBelow', () => {
  it('stops when a real row would collide with the synthetic ids', () => {
    expect(() => {
      assertIdsBelow('entries', [{ id: 5 }], 1000)
    }).not.toThrow()
    expect(() => {
      assertIdsBelow('entries', [{ id: 1000 }], 1000)
    }).toThrow(/entries/)
  })
})

describe('insertRowsSql', () => {
  it('writes rows with the same columns as multi-row INSERTs of at most `per` rows', () => {
    const rows = [1, 2, 3].map((id) => ({ id, code: `A${String(id)}`, note: null }))
    expect(insertRowsSql('entries', rows, 2)).toEqual([
      "INSERT INTO entries (id, code, note) VALUES\n(1, 'A1', NULL),\n(2, 'A2', NULL);",
      "INSERT INTO entries (id, code, note) VALUES\n(3, 'A3', NULL);",
    ])
    expect(() => insertRowsSql('entries', [{ id: 1 }, { code: 'x' }], 2)).toThrow(/columns/)
  })
})
