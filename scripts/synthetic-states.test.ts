import { describe, expect, it } from 'vitest'

import {
  assignStatuses,
  buildCandidates,
  type Candidate,
  entryCovers,
  mixSystems,
  mulberry32,
  pickForTarget,
  type PoolEntry,
  SYNTHETIC_IDS,
  syntheticState,
  withCategoryCodes,
  type SyntheticContext,
} from './synthetic-states'

const icd = (code: string, extra: Partial<PoolEntry> = {}): PoolEntry => ({
  code_system: 'icd10cm',
  raw_code: code,
  code_norm: code,
  match_kind: 'exact',
  range_end_norm: null,
  includes_children: 0,
  ...extra,
})

describe('mulberry32', () => {
  it('gives the same numbers for the same seed, in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 5 }, () => a())
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()))
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true)
    expect(mulberry32(43)()).not.toBe(xs[0])
  })
})

describe('entryCovers', () => {
  it('follows the overview rules for exact, children, prefix and ranges', () => {
    expect(entryCovers(icd('F200'), 'F200')).toBe(true)
    expect(entryCovers(icd('F20'), 'F200')).toBe(false)
    expect(entryCovers(icd('F20', { includes_children: 1 }), 'F200')).toBe(true)
    expect(entryCovers(icd('F20', { match_kind: 'prefix', includes_children: 1 }), 'F209')).toBe(
      true,
    )
    const wild = icd('C00', { match_kind: 'range', range_end_norm: 'C14', includes_children: 1 })
    expect(entryCovers(wild, 'C140')).toBe(true)
    expect(entryCovers(wild, 'C150')).toBe(false)
    const plain = icd('E1010', { match_kind: 'range', range_end_norm: 'E1029' })
    expect(entryCovers(plain, 'E1021')).toBe(true)
    expect(entryCovers(plain, 'E10211')).toBe(false)
    expect(entryCovers({ ...icd('F200'), code_system: 'hcpcs' }, 'F200')).toBe(false)
  })
})

describe('buildCandidates', () => {
  it('lists each pool entry once per category it covers, with the codes it covers', () => {
    const pool = [
      icd('F20', { includes_children: 1 }),
      icd('F200'),
      icd('F200'),
      icd('C50', { match_kind: 'prefix', includes_children: 1 }),
    ]
    const universe = new Map([
      ['serious-mental-illness', ['F200', 'F201']],
      ['cancer', ['C501', 'C509']],
    ])
    const out = buildCandidates(pool, universe)
    expect(out.get('serious-mental-illness')?.map((c) => [c.entry.code_norm, c.covers])).toEqual([
      // In pool key order ('exact|F200|' sorts before 'exact|F20|').
      ['F200', ['F200']],
      ['F20', ['F200', 'F201']],
    ])
    expect(out.get('cancer')?.map((c) => c.covers)).toEqual([['C501', 'C509']])
  })
})

describe('pickForTarget', () => {
  const candidates: Candidate[] = Array.from({ length: 100 }, (_, i) => ({
    entry: icd(`A${String(i).padStart(3, '0')}`),
    covers: [`A${String(i).padStart(3, '0')}`],
  }))

  it('lands inside the band it was asked for', () => {
    for (const [band, lo, hi] of [
      ['high', 0.75, 1],
      ['mid', 0.25, 0.745],
      ['low', 0.01, 0.245],
    ] as const) {
      const picked = pickForTarget(candidates, 100, band, mulberry32(7), 200)
      const share = picked.covered / 100
      expect(share).toBeGreaterThanOrEqual(lo)
      expect(share).toBeLessThan(hi + 1e-9)
    }
  })

  it('picks nothing for none and stops at the entry cap', () => {
    expect(pickForTarget(candidates, 100, 'none', mulberry32(7), 200).entries).toEqual([])
    expect(pickForTarget(candidates, 100, 'high', mulberry32(7), 10).entries).toHaveLength(10)
  })

  it('reaches mid in a large universe within the entry cap, as cancer needs', () => {
    const code = (i: number) => `C${String(i).padStart(4, '0')}`
    const broad = Array.from({ length: 10 }, (_, b) => ({
      entry: icd(`C${String(b)}`, { match_kind: 'prefix' }),
      covers: Array.from({ length: 100 }, (_, i) => code(b * 100 + i)),
    }))
    const narrow = Array.from({ length: 1000 }, (_, i) => ({
      entry: icd(code(i)),
      covers: [code(i)],
    }))
    for (const seed of [1, 2, 3]) {
      const share =
        pickForTarget([...narrow, ...broad], 1000, 'mid', mulberry32(seed), 20).covered / 1000
      expect(share).toBeGreaterThanOrEqual(0.25)
      expect(share).toBeLessThan(0.745)
    }
  })

  it('also lists some single codes its broad entries already cover, as states do', () => {
    const codes = Array.from({ length: 40 }, (_, i) => `F2${String(i).padStart(2, '0')}`)
    const broad = { entry: icd('F2', { match_kind: 'prefix' }), covers: codes }
    const single = codes.map((c) => ({ entry: icd(c), covers: [c] }))
    const picked = pickForTarget([broad, ...single], 40, 'high', mulberry32(3), 50)
    expect(picked.covered).toBe(40)
    expect(picked.entries[0]).toBe(broad.entry)
    expect(picked.entries.length).toBeGreaterThan(1)
  })

  it('skips a broad entry that would overshoot the band', () => {
    const broad: Candidate = {
      entry: icd('A', { match_kind: 'prefix' }),
      covers: candidates.map((c) => c.covers[0] ?? ''),
    }
    const picked = pickForTarget([broad, ...candidates], 100, 'low', mulberry32(1), 200)
    expect(picked.entries).not.toContain(broad.entry)
  })
})

describe('assignStatuses', () => {
  const ids = Array.from({ length: 47 }, (_, i) =>
    String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)),
  )

  it('makes 40 published, 4 announced and 3 none, the same each time', () => {
    const a = assignStatuses(ids)
    const count = (s: string) => [...a.values()].filter((v) => v === s).length
    expect([count('published'), count('announced'), count('none')]).toEqual([40, 4, 3])
    expect(assignStatuses([...ids].reverse())).toEqual(a)
  })
})

describe('syntheticState', () => {
  const universe = new Map([
    [
      'serious-mental-illness',
      Array.from({ length: 40 }, (_, i) => `F2${String(i).padStart(2, '0')}`),
    ],
    ['cancer', Array.from({ length: 40 }, (_, i) => `C5${String(i).padStart(2, '0')}`)],
  ])
  const pool = [
    ...(universe.get('serious-mental-illness') ?? []).map((c) => icd(c)),
    ...(universe.get('cancer') ?? []).map((c) => icd(c)),
    icd('C5', { match_kind: 'prefix', includes_children: 1 }),
    { ...icd('E0601'), code_system: 'hcpcs' as const },
    { ...icd('99490'), code_system: 'cpt' as const },
  ]
  const ctx: SyntheticContext = {
    categories: [
      { id: 5, slug: 'serious-mental-illness', federal_category: 'disabling_mental_disorder' },
      { id: 12, slug: 'cancer', federal_category: 'serious_complex_medical' },
      { id: 19, slug: 'frailty-indicators', federal_category: 'state_specific' },
    ],
    candidates: buildCandidates(pool, universe),
    universeSize: new Map([...universe].map(([k, v]) => [k, v.length])),
    nonIcd: pool.filter((e) => e.code_system !== 'icd10cm'),
    actor: 'seed@localhost',
  }

  it('is the same for the same state and differs between states', () => {
    expect(syntheticState('TX', 3, ctx)).toEqual(syntheticState('TX', 3, ctx))
    expect(JSON.stringify(syntheticState('TX', 3, ctx).entries)).not.toBe(
      JSON.stringify(syntheticState('OH', 3, ctx).entries),
    )
  })

  it('writes one source, one published version and entries with offset ids and no text', () => {
    const s = syntheticState('TX', 3, ctx)
    expect(s.source).toMatchObject({
      id: SYNTHETIC_IDS.source + 3,
      state_id: 'TX',
      title: 'Synthetic test list (seed data, not a real state list)',
      url: null,
      file_type: 'pdf',
      byte_size: 0,
      r2_key: 'seed/TX',
    })
    expect(String(s.source['sha256'])).toMatch(/^[0-9a-f]{64}$/)
    expect(String(s.source['publisher_date'])).toMatch(/^2026-\d\d-\d\d$/)
    expect(s.version).toMatchObject({
      id: SYNTHETIC_IDS.version + 3,
      version_no: 1,
      status: 'published',
      row_count: s.entries.length,
    })
    for (const e of s.entries) {
      expect(e['description_published']).toBeNull()
      expect(Number(e['id'])).toBeGreaterThanOrEqual(SYNTHETIC_IDS.entry)
      expect(e['version_id']).toBe(SYNTHETIC_IDS.version + 3)
      expect(e['source_document_id']).toBe(SYNTHETIC_IDS.source + 3)
    }
    expect(new Set(s.entries.map((e) => e['id'])).size).toBe(s.entries.length)
  })

  it('maps every named category to a federal category and approves only some unified mappings', () => {
    const all = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'HI', 'ID', 'IL'].map(
      (id, i) => syntheticState(id, i, ctx),
    )
    for (const s of all) {
      const keys = new Set(
        s.entries.map((e) => `${String(e['state_category'])}|${String(e['state_subcategory'])}`),
      )
      const named = [...keys].filter((k) => !k.startsWith('|'))
      expect(
        s.categoryMappings
          .map((m) => `${String(m['state_category'])}|${String(m['state_subcategory'])}`)
          .sort(),
      ).toEqual(named.sort())
      for (const m of s.categoryMappings)
        expect(m).toMatchObject({ method: 'manual', confidence: null })
      for (const m of s.unifiedMappings)
        expect(m).toMatchObject({ status: 'approved', reviewed_by: 'seed@localhost' })
    }
    const named = all.flatMap((s) => s.categoryMappings).length
    const exact = all.flatMap((s) => s.unifiedMappings).filter((m) => m['relation'] === 'exact')
    expect(exact.length).toBeGreaterThan(0)
    expect(exact.length).toBeLessThan(named)
    for (const m of exact) expect(m).toMatchObject({ basis: 'state_text', confidence: 'high' })
  })
})

describe('mixSystems', () => {
  it('takes code systems in turn, so a short list holds more than CPT', () => {
    const of = (system: string, code: string) => ({ ...icd(code), code_system: system })
    const list = [
      of('cpt', '1'),
      of('cpt', '2'),
      of('cpt', '3'),
      of('hcpcs', 'A'),
      of('revenue', 'R'),
    ]
    expect(mixSystems(list, 4).map((e) => e.code_norm)).toEqual(['1', 'A', 'R', '2'])
  })
})

describe('withCategoryCodes', () => {
  it('adds the 3-character category of each ICD-10-CM code, with its children, once', () => {
    const pool = [icd('F2010'), icd('F209'), icd('C50', { includes_children: 1 }), icd('C501')]
    const added = withCategoryCodes(pool).slice(pool.length)
    expect(added).toEqual([icd('F20', { includes_children: 1 })])
    expect(withCategoryCodes([{ ...icd('99490'), code_system: 'cpt' }])).toHaveLength(1)
  })
})
