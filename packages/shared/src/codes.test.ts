// Table-driven tests: one row per code pattern seen in the state files (docs/sources.md).
// Every bug in parsing or normalization gets a row here (docs/testing.md).
import { describe, expect, it } from 'vitest'

import {
  codeUrlPath,
  entryCovers,
  formatCode,
  inferCodeSystem,
  normalizeCode,
  parseCodeCell,
  parseCodeUrl,
  splitCodeList,
  type CodeProblemKind,
  type ParseOptions,
  type ParsedCode,
} from './codes'

type Expected = Partial<Omit<ParsedCode, 'rawCode'>>

/** Shorthand: the single code a cell parses to. */
function one(raw: string, options?: ParseOptions): ParsedCode {
  const { codes, problems } = parseCodeCell(raw, options)
  expect(problems).toEqual([])
  expect(codes).toHaveLength(1)
  const [code] = codes
  if (!code) throw new Error('no code')
  return code
}

describe('normalizeCode', () => {
  it.each([
    ['F20.0', 'F200'],
    ['f20.0 ', 'F200'],
    ['F200', 'F200'],
    [' a01.03', 'A0103'],
  ])('%j -> %s', (raw, norm) => {
    expect(normalizeCode(raw)).toBe(norm)
  })
})

describe('splitCodeList', () => {
  it.each([
    ['33230 and 33240', ['33230', '33240']], // NE
    ['E1037-E1224 and E1229-E1295', ['E1037-E1224', 'E1229-E1295']], // NE multi-range
    ['T2042, X2042,\nT2043', ['T2042', 'X2042', 'T2043']], // NE comma list across lines
    ['32851–32854', ['32851–32854']], // NE en-dash range stays whole
    ['F41.*-F42.*', ['F41.*-F42.*']], // LA
    ['J7500 - J7599', ['J7500 - J7599']],
    ['F20.0; F20.1', ['F20.0', 'F20.1']],
    ['  ', []],
  ])('%j', (raw, parts) => {
    expect(splitCodeList(raw)).toEqual(parts)
  })
})

describe('inferCodeSystem', () => {
  it.each([
    ['F20.0', 'icd10cm'],
    ['F20', 'icd10cm'], // 3-character category
    ['C7A.010', 'icd10cm'], // GA: letter in 3rd place
    ['S14.111A', 'icd10cm'], // GA: 7th character
    ['28400', 'cpt'], // 5 digits
    ['0001F', 'cpt'], // CPT Category II
    ['0042T', 'cpt'], // CPT Category III
    ['0001U', 'cpt'], // PLA code
    ['G0410', 'hcpcs'], // LA service code, undotted letter + 4 digits
    ['J1630', 'hcpcs'], // LA pharmacy row that is a HCPCS drug code
    ['912', 'revenue'], // LA 3-digit revenue code
    ['1002', 'revenue'], // LA 4-digit revenue code
    ['F200', 'icd10cm'], // undotted, 4 chars: no other system has this shape
    ['S72001A', 'icd10cm'], // undotted 7 chars
  ])('%s -> %s', (raw, system) => {
    expect(inferCodeSystem(raw)).toEqual({ system, ambiguous: false })
  })

  it('treats letter + 4 digits as HCPCS, or as ambiguous in a source that drops ICD dots', () => {
    expect(inferCodeSystem('A0103')).toEqual({ system: 'hcpcs', ambiguous: false })
    expect(inferCodeSystem('A0103', { undottedIcd: true })).toEqual({
      system: 'icd10cm',
      ambiguous: true,
    })
  })

  it('returns null for shapes no system has', () => {
    expect(inferCodeSystem('ZAF')).toEqual({ system: null, ambiguous: false })
    expect(inferCodeSystem('Infections')).toEqual({ system: null, ambiguous: false })
  })
})

describe('parseCodeCell: single codes', () => {
  it.each<[string, ParseOptions | undefined, Expected]>([
    // Exact ICD-10-CM codes, dotted and undotted
    [
      'F20.0',
      undefined,
      { codeSystem: 'icd10cm', codeNorm: 'F200', matchKind: 'exact', includesChildren: 0 },
    ],
    ['F10.26', undefined, { codeNorm: 'F1026', includesChildren: 0 }], // GA
    ['A0103', { system: 'icd10cm' }, { codeSystem: 'icd10cm', codeNorm: 'A0103' }], // NE, no dots
    ['F03.A2', undefined, { codeNorm: 'F03A2' }], // GA: letter after the dot
    ['C96.Z', undefined, { codeNorm: 'C96Z' }], // GA
    ['M35.0B', undefined, { codeNorm: 'M350B' }], // GA
    // Placeholder X followed by more characters is an exact code, not a wildcard
    ['W01.0XXA', undefined, { codeNorm: 'W010XXA', matchKind: 'exact' }],
    ['S06.2X0A', undefined, { codeNorm: 'S062X0A', matchKind: 'exact' }], // GA
    ['T84.50XA', undefined, { codeNorm: 'T8450XA', matchKind: 'exact' }], // GA
    ['H54.2X11', undefined, { codeNorm: 'H542X11', matchKind: 'exact' }], // LA
    // Wildcards
    ['C34.x', undefined, { codeNorm: 'C34', matchKind: 'prefix', includesChildren: 1 }], // MT
    ['K70.X', undefined, { codeNorm: 'K70', matchKind: 'prefix' }], // MT
    ['Q90.x', undefined, { codeNorm: 'Q90', matchKind: 'prefix' }], // MT
    ['D57.0X', undefined, { codeNorm: 'D570', matchKind: 'prefix' }], // MT: trailing X after digits
    ['A15.x', { system: 'icd10cm' }, { codeNorm: 'A15', matchKind: 'prefix' }], // NE
    ['Z89.*', undefined, { codeNorm: 'Z89', matchKind: 'prefix' }], // LA asterisk
    ['I63.*', undefined, { codeNorm: 'I63', matchKind: 'prefix' }], // LA
    ['S06.2*', undefined, { codeNorm: 'S062', matchKind: 'prefix' }], // LA
    ['D89.81*', undefined, { codeNorm: 'D8981', matchKind: 'prefix' }], // LA
    // Other code systems
    ['28400', undefined, { codeSystem: 'cpt', codeNorm: '28400', includesChildren: 0 }],
    ['G0410', undefined, { codeSystem: 'hcpcs', codeNorm: 'G0410' }],
    ['912', undefined, { codeSystem: 'revenue', codeNorm: '0912' }], // LA: pad to 4 digits
    ['0100', undefined, { codeSystem: 'revenue', codeNorm: '0100' }],
    ['H2G', { system: 'drug_class' }, { codeSystem: 'drug_class', codeNorm: 'H2G' }], // LA pharmacy
    ['ZAF', { system: 'drug_class' }, { codeSystem: 'drug_class', codeNorm: 'ZAF' }],
  ])('%s', (raw, options, expected) => {
    expect(one(raw, options)).toMatchObject({ rawCode: raw, flags: [], ...expected })
  })

  it('flags a 3-character category: does the state mean the whole category?', () => {
    expect(one('F20')).toMatchObject({
      codeNorm: 'F20',
      matchKind: 'exact',
      includesChildren: null,
      flags: ['category_scope'],
    })
  })

  it('flags an undotted letter + 4 digits in a source that drops ICD dots', () => {
    expect(one('A0103', { undottedIcd: true })).toMatchObject({
      codeSystem: 'icd10cm',
      flags: ['system_ambiguous'],
    })
  })

  it('maps the same code written with and without dots to one code_norm (NE vs LA)', () => {
    expect(one('A0103', { system: 'icd10cm' }).codeNorm).toBe(one('A01.03').codeNorm)
  })
})

describe('parseCodeCell: ranges', () => {
  it.each<[string, ParseOptions | undefined, Expected]>([
    [
      '32851–32854',
      undefined,
      { codeSystem: 'cpt', codeNorm: '32851', rangeEndNorm: '32854', includesChildren: 0 },
    ], // NE en-dash
    ['J7500-J7599', undefined, { codeSystem: 'hcpcs', codeNorm: 'J7500', rangeEndNorm: 'J7599' }], // LA
    ['J7500 - J7599', undefined, { codeNorm: 'J7500', rangeEndNorm: 'J7599' }],
    [
      'E08.621-E08.622',
      undefined,
      { codeSystem: 'icd10cm', codeNorm: 'E08621', rangeEndNorm: 'E08622', includesChildren: 0 },
    ], // LA
    ['F41.*-F42.*', undefined, { codeNorm: 'F41', rangeEndNorm: 'F42', includesChildren: 1 }], // LA wildcard range
  ])('%s', (raw, options, expected) => {
    expect(one(raw, options)).toMatchObject({
      rawCode: raw,
      matchKind: 'range',
      flags: [],
      ...expected,
    })
  })

  it('flags a range of bare categories: whole categories or just those codes?', () => {
    expect(one('D80-D83')).toMatchObject({
      codeNorm: 'D80',
      rangeEndNorm: 'D83',
      matchKind: 'range',
      includesChildren: null,
      flags: ['category_scope'],
    })
  })

  it('reads a wildcard on one end as whole categories, with a warning', () => {
    expect(one('M30-M31.*')).toMatchObject({
      codeNorm: 'M30',
      rangeEndNorm: 'M31',
      includesChildren: 1,
      flags: ['mixed_wildcard_range'],
    })
  })

  it('splits a cell into several entries (NE)', () => {
    const { codes, problems } = parseCodeCell('E1037-E1224 and E1229-E1295, E1300')
    expect(problems).toEqual([])
    expect(codes.map((c) => [c.matchKind, c.codeNorm, c.rangeEndNorm])).toEqual([
      ['range', 'E1037', 'E1224'],
      ['range', 'E1229', 'E1295'],
      ['exact', 'E1300', null],
    ])
  })
})

describe('parseCodeCell: problems (the row stops for manual entry)', () => {
  it.each<[string, CodeProblemKind, ParseOptions | undefined]>([
    ['L89.500-L89', 'truncated_range', undefined], // MT: the PDF cut the column; never guess
    ['L89.500-L89...', 'truncated_range', undefined],
    ['32854-32851', 'reversed_range', undefined],
    ['F20.0-32851', 'mixed_system_range', undefined],
    ['F20-F20.9', 'unclear_range', undefined],
    ['ZAF', 'unrecognized', undefined], // a drug class without the source's code system
    ['Infections', 'unrecognized', undefined],
    ['F20.0', 'system_mismatch', { system: 'cpt' }],
  ])('%s -> %s', (raw, problem, options) => {
    const result = parseCodeCell(raw, options)
    expect(result.codes).toEqual([])
    expect(result.problems).toEqual([expect.objectContaining({ raw, problem })])
  })

  it('keeps the good parts of a cell and reports the bad ones', () => {
    const { codes, problems } = parseCodeCell('F20.0, L89.500-L89')
    expect(codes.map((c) => c.codeNorm)).toEqual(['F200'])
    expect(problems.map((p) => p.problem)).toEqual(['truncated_range'])
  })

  it('reports an empty cell', () => {
    expect(parseCodeCell(' ').problems).toEqual([expect.objectContaining({ problem: 'empty' })])
  })
})

describe('formatCode', () => {
  it.each([
    ['icd10cm', 'F200', 'F20.0'],
    ['icd10cm', 'F20', 'F20'],
    ['icd10cm', 'S14111A', 'S14.111A'],
    ['cpt', '28400', '28400'],
    ['revenue', '0912', '0912'],
  ] as const)('%s %s -> %s', (system, norm, display) => {
    expect(formatCode(system, norm)).toBe(display)
  })
})

describe('code page URLs (docs/seo.md)', () => {
  it.each([
    ['icd10cm', 'F200', '/codes/icd-10-cm/F20.0'],
    ['cpt', '28400', '/codes/cpt/28400'],
    ['hcpcs', 'J7500', '/codes/hcpcs/J7500'],
    ['revenue', '0912', '/codes/revenue/0912'],
    ['drug_class', 'H2G', '/codes/drug-class/H2G'],
  ] as const)('%s %s <-> %s', (system, norm, path) => {
    expect(codeUrlPath(system, norm)).toBe(path)
    const [, , slug = '', code = ''] = path.split('/')
    expect(parseCodeUrl(slug, code)).toEqual({ system, codeNorm: norm, canonicalPath: path })
  })

  it('gives no page to codes outside a known system', () => {
    expect(codeUrlPath('other', 'X1')).toBeNull()
  })

  it('accepts lowercase or undotted variants and returns the canonical path for a 301', () => {
    expect(parseCodeUrl('icd-10-cm', 'f200')).toEqual({
      system: 'icd10cm',
      codeNorm: 'F200',
      canonicalPath: '/codes/icd-10-cm/F20.0',
    })
  })

  it('rejects unknown systems and codes that do not fit the system', () => {
    expect(parseCodeUrl('icd-9', 'F20.0')).toBeNull()
    expect(parseCodeUrl('cpt', 'F20.0')).toBeNull()
    expect(parseCodeUrl('icd-10-cm', 'C34.x')).toBeNull() // wildcards have no page
  })
})

describe('entryCovers', () => {
  const entry = (raw: string, options?: ParseOptions) => one(raw, options)
  const icd = (code: string) => ({ system: 'icd10cm', codeNorm: normalizeCode(code) }) as const

  it.each([
    ['F20.0', 'F20.0', true],
    ['F20.0', 'F20.01', false],
    ['C34.x', 'C34.1', true], // prefix
    ['C34.x', 'C34', true],
    ['C34.x', 'C35.0', false],
    ['F41.*-F42.*', 'F41.1', true], // wildcard range covers whole categories
    ['F41.*-F42.*', 'F42.9', true],
    ['F41.*-F42.*', 'F43.0', false],
    ['F41.*-F42.*', 'F40.9', false],
    ['E08.621-E08.622', 'E08.621', true], // exact range compares whole codes
    ['E08.621-E08.622', 'E08.6219', false],
    ['E08.621-E08.623', 'E08.622', true],
    ['D80-D83', 'D81', true], // category range, scope unclear: only the listed categories
    ['D80-D83', 'D81.0', false],
  ])('%s covers %s: %s', (raw, code, covered) => {
    expect(entryCovers(entry(raw), icd(code))).toBe(covered)
  })

  it('covers children of an exact code only when includes_children = 1', () => {
    const f20 = entry('F20')
    expect(entryCovers({ ...f20, includesChildren: 1 }, icd('F20.0'))).toBe(true)
    expect(entryCovers({ ...f20, includesChildren: 0 }, icd('F20.0'))).toBe(false)
    expect(entryCovers({ ...f20, includesChildren: null }, icd('F20.0'))).toBe(false)
  })

  it('covers numeric ranges and never crosses code systems', () => {
    const cpt = entry('32851–32854')
    expect(entryCovers(cpt, { system: 'cpt', codeNorm: '32853' })).toBe(true)
    expect(entryCovers(cpt, { system: 'cpt', codeNorm: '32855' })).toBe(false)
    expect(entryCovers(entry('J7500-J7599'), { system: 'hcpcs', codeNorm: 'J7501' })).toBe(true)
    expect(
      entryCovers(entry('A0103', { system: 'icd10cm' }), { system: 'hcpcs', codeNorm: 'A0103' }),
    ).toBe(false)
  })
})
