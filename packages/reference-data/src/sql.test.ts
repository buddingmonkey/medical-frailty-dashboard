import { describe, expect, it } from 'vitest'

import { loadBudget, toSqlChunks, type RefCodeRow } from './sql.ts'

const row = (codeNorm: string, description = 'A code'): RefCodeRow => ({
  codeSystem: 'icd10cm',
  codeNorm,
  description,
  parentNorm: null,
  chapter: '5',
  billable: 1,
  validFrom: '2026-10-01',
  validTo: null,
})

describe('toSqlChunks', () => {
  it('splits rows into chunk files of whole INSERT statements', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(`F${String(10 + i)}`))
    const chunks = toSqlChunks(rows, {
      release: 'icd10cm-fy2027',
      rowsPerChunk: 10,
      rowsPerStatement: 4,
    })
    expect(chunks.map((c) => c.rowCount)).toEqual([10, 10, 5])
    expect(chunks[0]?.name).toBe('icd10cm-fy2027-000')
    expect(chunks[0]?.sql.match(/INSERT OR IGNORE INTO ref_codes/g)).toHaveLength(3)
  })

  it('marks each chunk as loaded in app_meta, inside the same file', () => {
    const [chunk] = toSqlChunks([row('F20')], {
      release: 'r1',
      rowsPerChunk: 10,
      rowsPerStatement: 10,
    })
    expect(chunk?.sql).toContain(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('ref_codes_chunk:r1-000', '1');",
    )
  })

  it('escapes quotes and writes NULLs', () => {
    const [chunk] = toSqlChunks([row('F20', "Alzheimer's disease")], {
      release: 'r1',
      rowsPerChunk: 10,
      rowsPerStatement: 10,
    })
    expect(chunk?.sql).toContain(
      "('icd10cm', 'F20', 'Alzheimer''s disease', NULL, '5', 1, '2026-10-01', NULL)",
    )
  })

  it('keeps every statement under D1’s 100 KB statement limit', () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row(`F${String(i).padStart(4, '0')}`, 'x'.repeat(400)),
    )
    for (const chunk of toSqlChunks(rows, { release: 'r1' })) {
      for (const statement of chunk.sql.split(';\n')) {
        expect(new TextEncoder().encode(statement).length).toBeLessThan(100_000)
      }
    }
  })
})

describe('loadBudget', () => {
  it('has no limit for a local load', () => {
    expect(loadBudget(true, '80000')).toBe(Infinity)
  })

  it('reads --max-rows for a remote load and refuses nonsense', () => {
    expect(loadBudget(false, '80000')).toBe(80000)
    expect(() => loadBudget(false, '0')).toThrow('--max-rows')
    expect(() => loadBudget(false, 'many')).toThrow('--max-rows')
  })
})
