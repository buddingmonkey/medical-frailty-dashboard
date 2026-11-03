import { describe, expect, it } from 'vitest'

import {
  appendSql,
  COPY_TABLES,
  copyAllowed,
  insertSql,
  finishSql,
  parseWranglerJson,
  sqlString,
  statesSql,
  targetNotEmpty,
  unifiedDifferences,
} from './copy-state-data'

describe('copyAllowed', () => {
  it('lets production be the target only inside GitHub Actions', () => {
    expect(copyAllowed('production', {})).toMatch(/only from CI/)
    expect(copyAllowed('production', { GITHUB_ACTIONS: 'false' })).toMatch(/only from CI/)
    expect(copyAllowed('production', { GITHUB_ACTIONS: 'true' })).toBeNull()
    expect(copyAllowed('local', {})).toBeNull()
  })
})

describe('targetNotEmpty', () => {
  it('names every copied table that already has rows in the target', () => {
    const counts = Object.fromEntries(COPY_TABLES.map((t) => [t, 0]))
    expect(targetNotEmpty(counts)).toEqual([])
    expect(targetNotEmpty({ ...counts, entries: 3, audit_log: 1 })).toEqual([
      'entries (3)',
      'audit_log (1)',
    ])
  })

  it('fails closed when a count is missing', () => {
    expect(targetNotEmpty({})).toHaveLength(COPY_TABLES.length)
  })
})

describe('unifiedDifferences', () => {
  const rows = [
    { id: 1, slug: 'cancer', status: 'draft' },
    { id: 2, slug: 'sud', status: 'draft' },
  ]

  it('is empty when both databases have the same unified category ids and slugs', () => {
    expect(unifiedDifferences(rows, [...rows].reverse())).toEqual([])
  })

  it('lists ids whose slug differs or that only one side has', () => {
    expect(
      unifiedDifferences(rows, [
        { id: 1, slug: 'cancers', status: 'draft' },
        { id: 3, slug: 'x', status: 'draft' },
      ]),
    ).toEqual(['1: cancer ≠ cancers', '2: only in preview', '3: only in the target'])
  })
})

describe('sqlString', () => {
  it('quotes text and doubles single quotes; NULL for null', () => {
    expect(sqlString("O'Neil")).toBe("'O''Neil'")
    expect(sqlString(null)).toBe('NULL')
  })
})

describe('statesSql', () => {
  it('sets status, published version and updated_at for each state that has a list', () => {
    expect(
      statesSql([
        { id: 'MT', status: 'published', published_version_id: 1, updated_at: '2026-11-02T17:00Z' },
        { id: 'LA', status: 'published', published_version_id: 5, updated_at: null },
      ]),
    ).toEqual([
      "UPDATE states SET status = 'published', published_version_id = 1, updated_at = '2026-11-02T17:00Z' WHERE id = 'MT';",
      "UPDATE states SET status = 'published', published_version_id = 5, updated_at = NULL WHERE id = 'LA';",
    ])
  })

  it('refuses a state id that is not two capital letters', () => {
    expect(() =>
      statesSql([{ id: "X'", status: 'none', published_version_id: null, updated_at: null }]),
    ).toThrow(/state id/)
  })

  it('refuses a published version id that is not an integer', () => {
    expect(() =>
      statesSql([{ id: 'MT', status: 'published', published_version_id: 1.5, updated_at: null }]),
    ).toThrow(/version id/)
  })
})

describe('finishSql', () => {
  it('bumps data_version and writes one audit row with the copied counts', () => {
    const [bump, audit] = finishSql({ entries: 25173 }, '2026-11-03T04:30:00.000Z')
    expect(bump).toContain("VALUES ('data_version', '1')")
    expect(bump).toContain('ON CONFLICT')
    expect(audit).toBe(
      "INSERT INTO audit_log (at, actor_email, action, target, details_json) VALUES ('2026-11-03T04:30:00.000Z', 'ci: copy-state-data', 'data.copy', 'env:preview', '{\"rows\":{\"entries\":25173}}');",
    )
  })
})

describe('parseWranglerJson', () => {
  it('reads the results of the first statement, ignoring lines before the JSON', () => {
    const out = 'warning: something\n[{"results":[{"n":3}],"success":true}]\n'
    expect(parseWranglerJson(out)).toEqual([{ n: 3 }])
  })

  it('throws when there is no JSON', () => {
    expect(() => parseWranglerJson('error')).toThrow(/JSON/)
  })
})

describe('insertSql', () => {
  it('writes one INSERT with every column, leaving out the ones named', () => {
    expect(
      insertSql('dataset_versions', { id: 1, state_id: 'MT', label: null, report: 'big' }, [
        'report',
      ]),
    ).toBe("INSERT INTO dataset_versions (id, state_id, label) VALUES (1, 'MT', NULL);")
  })

  it('refuses a column name or value it cannot write safely', () => {
    expect(() => insertSql('t', { 'a b': 1 })).toThrow(/column/)
    expect(() => insertSql('t', { a: { x: 1 } })).toThrow(/value/)
    expect(() => insertSql('t', { a: 1.5 })).toThrow(/value/)
  })
})

describe('appendSql', () => {
  it('sets a long text column in pieces, each statement under the size given', () => {
    const value = `{"m":"${'é'.repeat(30)}🙂${'x'.repeat(40)}"}`
    const sql = appendSql('dataset_versions', 7, 'check_report_json', value, 40)
    expect(sql[0]).toBe("UPDATE dataset_versions SET check_report_json = '' WHERE id = 7;")
    expect(sql.length).toBeGreaterThan(2)
    // Joined back, the pieces are the value: no character is split.
    const pieces = sql.slice(1).map((s) => /\|\| '(.*)' WHERE/.exec(s)?.[1] ?? '')
    expect(pieces.join('')).toBe(value)
  })

  it('writes nothing for NULL', () => {
    expect(appendSql('t', 1, 'c', null, 40)).toEqual([])
  })
})
