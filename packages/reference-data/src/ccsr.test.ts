// fixtures/dxccsr_synthetic.csv is written by hand in the layout of AHRQ's DXCCSR CSV. Its
// category ids and groupings are invented: AHRQ's own file is never committed (README.md).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ccsrGroupsOf } from '@mfcd/shared/ccsr'
import { describe, expect, it } from 'vitest'

import { bodySystemName, compressCcsr, parseDxccsrCsv, type CcsrCode } from './ccsr.ts'

const fixture = readFileSync(join(import.meta.dirname, '../fixtures/dxccsr_synthetic.csv'), 'utf8')
const release = 'ccsr-dx-test'
const header = fixture.split('\r\n')[0] ?? ''

describe('parseDxccsrCsv', () => {
  const { codes, categories } = parseDxccsrCsv(fixture, { release })

  it('reads each code with its categories and the inpatient default', () => {
    expect(codes).toHaveLength(7)
    expect(codes[0]).toEqual({
      codeNorm: 'F200',
      categories: ['TST001'],
      defaultCategory: 'TST001',
    })
    expect(codes.find((c) => c.codeNorm === 'F312')).toEqual({
      codeNorm: 'F312',
      categories: ['TST002', 'TST003'],
      defaultCategory: 'TST003',
    })
  })

  it('records no default when the inpatient default is XXX000 (unacceptable principal dx)', () => {
    expect(codes.find((c) => c.codeNorm === 'Q990')?.defaultCategory).toBeNull()
  })

  it('lists each category once with its description, body system and release', () => {
    expect(categories).toEqual([
      {
        ccsrCategory: 'MBD901',
        description: 'Test group in a real body system',
        bodySystem: 'Mental, behavioral, and neurodevelopmental disorders',
        release,
      },
      { ccsrCategory: 'TST001', description: 'Test group one', bodySystem: 'TST', release },
      {
        ccsrCategory: 'TST002',
        description: 'Test group two, with a comma',
        bodySystem: 'TST',
        release,
      },
      { ccsrCategory: 'TST003', description: 'Test group three', bodySystem: 'TST', release },
    ])
  })

  it('refuses a file whose layout changed', () => {
    expect(() =>
      parseDxccsrCsv(fixture.replace('CCSR CATEGORY 6', 'CCSR CAT 6'), { release }),
    ).toThrow(/header/)
    const extraColumn = `${header}\r\n'F200',x,'TST001',a,'TST001',a,'TST001',a,' ',,' ',,' ',,' ',,' ',,r,extra\r\n`
    expect(() => parseDxccsrCsv(extraColumn, { release })).toThrow(/line 2.*19 fields/)
  })

  it('refuses a default that is not one of the code’s categories', () => {
    const bad = `${header}\r\n'F200',x,'TST009',a,'TST001',a,'TST001',a,' ',,' ',,' ',,' ',,' ',,r\r\n`
    expect(() => parseDxccsrCsv(bad, { release })).toThrow(/F200.*TST009/)
  })

  it('refuses a malformed code or category and conflicting descriptions', () => {
    const line = (code: string, cat: string, desc: string) =>
      `'${code}',x,'${cat}',${desc},'${cat}',${desc},'${cat}',${desc},' ',,' ',,' ',,' ',,' ',,r`
    expect(() =>
      parseDxccsrCsv(`${header}\r\n${line('F2.0', 'TST001', 'a')}\r\n`, { release }),
    ).toThrow(/code/)
    expect(() =>
      parseDxccsrCsv(`${header}\r\n${line('F200', 'TST01', 'a')}\r\n`, { release }),
    ).toThrow(/category/)
    const conflict = `${header}\r\n${line('F200', 'TST001', 'a')}\r\n${line('F201', 'TST001', 'b')}\r\n`
    expect(() => parseDxccsrCsv(conflict, { release })).toThrow(/TST001/)
  })
})

describe('bodySystemName', () => {
  it('names AHRQ’s body systems and falls back to the prefix', () => {
    expect(bodySystemName('NVS')).toBe('Diseases of the nervous system')
    expect(bodySystemName('TST')).toBe('TST')
  })
})

describe('compressCcsr', () => {
  const { codes } = parseDxccsrCsv(fixture, { release })
  const rows = compressCcsr(codes, release)

  it('stores one row per category for the shortest prefix whose codes all agree', () => {
    expect(rows).toEqual([
      { codeNorm: 'F20', ccsrCategory: 'TST001', isDefault: 1, release },
      { codeNorm: 'F311', ccsrCategory: 'TST002', isDefault: 1, release },
      { codeNorm: 'F311', ccsrCategory: 'TST003', isDefault: 0, release },
      { codeNorm: 'F312', ccsrCategory: 'TST002', isDefault: 0, release },
      { codeNorm: 'F312', ccsrCategory: 'TST003', isDefault: 1, release },
      { codeNorm: 'Q99', ccsrCategory: 'MBD901', isDefault: 0, release },
    ])
  })

  it('never compresses below 3 characters', () => {
    const same = (codeNorm: string): CcsrCode => ({
      codeNorm,
      categories: ['TST001'],
      defaultCategory: 'TST001',
    })
    expect(compressCcsr([same('F200'), same('F210')], release).map((r) => r.codeNorm)).toEqual([
      'F20',
      'F21',
    ])
  })

  it('keeps its own rows for a code that has longer codes under it (an old code CCSR kept)', () => {
    const code = (codeNorm: string, cat: string): CcsrCode => ({
      codeNorm,
      categories: [cat],
      defaultCategory: cat,
    })
    const nested = [code('B880', 'TST001'), code('B8801', 'TST002'), code('B8809', 'TST002')]
    const compressed = compressCcsr(nested, release)
    expect(compressed.map((r) => [r.codeNorm, r.ccsrCategory])).toEqual([
      ['B880', 'TST001'],
      ['B8801', 'TST002'],
      ['B8809', 'TST002'],
    ])
    for (const c of nested) {
      expect(ccsrGroupsOf(c.codeNorm, compressed)?.categories).toEqual(c.categories)
    }
  })

  it('refuses a code listed twice', () => {
    const twice = `${header}\r\n${fixture.split('\r\n')[1] ?? ''}\r\n${fixture.split('\r\n')[1] ?? ''}\r\n`
    expect(() => parseDxccsrCsv(twice, { release })).toThrow(/F200.*twice/)
  })

  it('gives every code its own groups back through the longest-prefix lookup', () => {
    const generated: CcsrCode[] = []
    const cats = ['TST001', 'TST002', 'TST003']
    for (let i = 0; i < 300; i++) {
      const code = `G${String(10 + (i % 7))}${String(i % 5)}${String(i % 3)}`
      if (generated.some((c) => c.codeNorm === code)) continue
      const own = i % 11 === 0 ? [cats[1] ?? '', cats[2] ?? ''] : [cats[i % 2] ?? '']
      generated.push({
        codeNorm: code,
        categories: own,
        defaultCategory: i % 13 ? (own[0] ?? null) : null,
      })
    }
    const all = [...codes, ...generated]
    const compressed = compressCcsr(all, release)
    expect(compressed.length).toBeLessThan(all.reduce((n, c) => n + c.categories.length, 0))
    for (const code of all) {
      expect(ccsrGroupsOf(code.codeNorm, compressed), code.codeNorm).toMatchObject({
        categories: [...code.categories].sort(),
        defaultCategory: code.defaultCategory,
      })
    }
    // No stored prefix is a prefix of another, so the longest match is the only match.
    const keys = [...new Set(compressed.map((r) => r.codeNorm))]
    for (const a of keys) {
      expect(
        keys.filter((b) => b !== a && b.startsWith(a)),
        a,
      ).toEqual([])
    }
  })
})
