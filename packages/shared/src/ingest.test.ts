import { describe, expect, it } from 'vitest'

import {
  applyMapping,
  type ColumnProfileInput,
  columnProfileSchema,
  guessColumnRoles,
  headerKey,
  type RawTable,
} from './ingest'

// Real header rows from docs/sources.md.
const GA = ['Code', 'Code Type', 'Description', 'Yes/ No', 'Rationale']
const LA = ['Category', 'Sub-Category', 'Group', 'Code Designation', 'Description', 'Code']
const MT = ['Category (tier)', 'Category', 'Condition Name', 'Code', 'Code Name']
const IN = ['Diagnosis code', 'Description', 'High-level condition', 'Federal category']

describe('guessColumnRoles', () => {
  it('reads the Georgia headers', () => {
    expect(guessColumnRoles(GA)).toEqual(['code', 'codeSystem', 'description', 'included', 'notes'])
  })

  it('reads the Louisiana headers, code last', () => {
    expect(guessColumnRoles(LA)).toEqual([
      'category',
      'subcategory',
      'ignore',
      'qualification',
      'description',
      'code',
    ])
  })

  it('reads the Montana headers', () => {
    expect(guessColumnRoles(MT)).toEqual(['tier', 'category', 'subcategory', 'code', 'description'])
  })

  it('reads Indiana’s “Federal category” as the state’s own federal category, not Category', () => {
    expect(guessColumnRoles(IN)).toEqual(['code', 'description', 'ignore', 'stateFederal'])
    expect(guessColumnRoles(['Code', 'Category', 'Federal Categories'])).toEqual([
      'code',
      'category',
      'stateFederal',
    ])
    expect(guessColumnRoles(['Code', 'federal_category'])).toEqual(['code', 'stateFederal'])
  })

  it('gives each role to the first matching column only', () => {
    expect(guessColumnRoles(['Code', 'ICD-10 Code', 'Description', 'Long description'])).toEqual([
      'code',
      'ignore',
      'description',
      'ignore',
    ])
  })
})

describe('headerKey', () => {
  it('ignores case and spacing, keeps order', () => {
    expect(headerKey([' Code ', 'Code  Type'])).toBe(headerKey(['code', 'code type']))
    expect(headerKey(['Code', 'Type'])).not.toBe(headerKey(['Type', 'Code']))
  })
})

const profile = (patch: Partial<ColumnProfileInput> = {}) =>
  columnProfileSchema.parse({
    roles: ['category', 'subcategory', 'ignore', 'qualification', 'description', 'code'],
    qualification: {
      mode: 'column',
      from: 'qualification',
      values: { '0': 'standalone', '1': 'needs_support', '2': 'supporting_only' },
      basis: 'inferred',
    },
    ...patch,
  })

describe('columnProfileSchema', () => {
  it('needs exactly one code column', () => {
    expect(columnProfileSchema.safeParse({ ...profile(), roles: ['description'] }).success).toBe(
      false,
    )
    expect(
      columnProfileSchema.safeParse({ ...profile(), roles: ['code', 'code', 'category'] }).success,
    ).toBe(false)
  })

  it('allows a role other than ignore only once', () => {
    expect(
      columnProfileSchema.safeParse({
        ...profile(),
        roles: ['code', 'category', 'category', 'qualification'],
      }).success,
    ).toBe(false)
  })

  it('needs the column a qualification rule reads from', () => {
    const result = columnProfileSchema.safeParse({
      roles: ['code', 'category'],
      qualification: { mode: 'column', from: 'tier', values: {}, basis: 'published' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts one value for the whole file, and defaults the category', () => {
    expect(
      columnProfileSchema.parse({
        roles: ['code', 'ignore', 'description'],
        qualification: { mode: 'fixed', value: 'standalone', basis: 'published' },
      }),
    ).toEqual({
      roles: ['code', 'ignore', 'description'],
      qualification: { mode: 'fixed', value: 'standalone', basis: 'published' },
      defaultCategory: '',
      defaultTier: '',
    })
  })
})

const la: RawTable = {
  name: 'HR1-Codes',
  header: LA,
  rows: [
    { locator: 'row 2', cells: ['Mental Health', 'SMI', 'G1', '0', 'Schizophrenia', 'F20.0'] },
    { locator: 'row 3', cells: ['Mental Health', 'SMI', 'G1', '2', 'Some support', ' F32.9 '] },
    { locator: 'row 4', cells: ['', '', '', '', '', ''] },
    { locator: 'row 5', cells: ['Physical', '', 'G2', '7', 'Odd value', 'G35'] },
    { locator: 'row 6', cells: ['Physical', '', 'G2', '1', 'No code here', ''] },
    { locator: 'row 7', cells: ['Short row', 'x'] },
  ],
}

describe('applyMapping', () => {
  it('maps cells by role and the qualification rule, trimming cells', () => {
    const { rows } = applyMapping(la, profile())
    expect(rows[0]).toEqual({
      locator: 'row 2',
      rawCode: 'F20.0',
      codeSystemHint: '',
      description: 'Schizophrenia',
      category: 'Mental Health',
      subcategory: 'SMI',
      tier: '',
      qualification: 'standalone',
      qualificationBasis: 'inferred',
      qualificationValue: '0',
      included: true,
      notes: '',
      stateFederal: '',
    })
    expect(rows[1]).toMatchObject({ rawCode: 'F32.9', qualification: 'supporting_only' })
  })

  it('skips blank rows, counts rows with no code, and marks unknown qualification values', () => {
    const result = applyMapping(la, profile())
    expect(result.rows.map((r) => r.locator)).toEqual(['row 2', 'row 3', 'row 5'])
    expect(result.rows[2]).toMatchObject({ qualification: 'unknown' })
    expect(result.blankRows).toBe(1)
    expect(result.noCodeRows).toEqual(['row 6', 'row 7'])
    expect(result.unmappedQualificationValues).toEqual(['7'])
  })

  it('reads Georgia’s Yes/No column as included, and keeps the rationale', () => {
    const ga: RawTable = {
      name: 'Attachment A',
      header: GA,
      rows: [
        { locator: 'row 2', cells: ['F20.0', 'ICD-10', 'Schizophrenia', 'Yes', 'SMI'] },
        { locator: 'row 3', cells: ['F32.9', 'ICD-10', 'Depression', ' no ', 'Not severe'] },
        { locator: 'row 4', cells: ['F31.0', 'ICD-10', 'Bipolar', '', ''] },
      ],
    }
    const { rows } = applyMapping(
      ga,
      columnProfileSchema.parse({
        roles: guessColumnRoles(GA),
        qualification: { mode: 'fixed', value: 'standalone', basis: 'published' },
      }),
    )
    expect(rows.map((r) => [r.included, r.notes, r.qualificationValue])).toEqual([
      [true, 'SMI', ''],
      [false, 'Not severe', ''],
      [true, '', ''],
    ])
  })

  it('uses the tier for every row when the file has no tier column (GA Attachment A or B)', () => {
    const ga: RawTable = {
      name: 'Attachment B',
      header: GA,
      rows: [{ locator: 'row 2', cells: ['F20.0', 'ICD-10', 'Schizophrenia', 'Yes', 'SMI'] }],
    }
    const { rows } = applyMapping(
      ga,
      columnProfileSchema.parse({
        roles: guessColumnRoles(GA),
        qualification: { mode: 'fixed', value: 'needs_support', basis: 'published' },
        defaultTier: 'Attachment B',
      }),
    )
    expect(rows[0]?.tier).toBe('Attachment B')
  })

  it('keeps the state’s federal category cell as written (Indiana)', () => {
    const table: RawTable = {
      name: 'Tier 1',
      header: IN,
      rows: [
        {
          locator: 'row 2',
          cells: ['C9021', 'Leukemia', 'Leukemia', ' Serious or complex medical condition '],
        },
      ],
    }
    const { rows } = applyMapping(
      table,
      columnProfileSchema.parse({
        roles: ['code', 'description', 'category', 'stateFederal'],
        qualification: { mode: 'fixed', value: 'standalone', basis: 'published' },
      }),
    )
    expect(rows[0]).toMatchObject({
      category: 'Leukemia',
      stateFederal: 'Serious or complex medical condition',
    })
  })

  it('uses the default category when the file has none', () => {
    const ga: RawTable = {
      name: 'Attachment A',
      header: GA,
      rows: [{ locator: 'row 2', cells: ['F20.0', 'ICD-10', 'Schizophrenia', 'Yes', 'SMI'] }],
    }
    const { rows } = applyMapping(
      ga,
      columnProfileSchema.parse({
        roles: guessColumnRoles(GA),
        qualification: { mode: 'fixed', value: 'standalone', basis: 'published' },
        defaultCategory: 'Attachment A',
      }),
    )
    expect(rows[0]).toMatchObject({
      rawCode: 'F20.0',
      codeSystemHint: 'ICD-10',
      category: 'Attachment A',
      qualification: 'standalone',
      qualificationBasis: 'published',
    })
  })
})
