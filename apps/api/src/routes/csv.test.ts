import { describe, expect, it } from 'vitest'

import { CODE_CSV_COLUMNS, codeCsvCells, perStateCsvColumns } from './csv'

// The shared part of the code-by-state CSVs. Each route's whole file is pinned in pages.test.ts
// and states-compare-pages.test.ts.

describe('code-by-state CSV columns', () => {
  it('writes the code columns, with CMS text marked CMS and a state’s own text by postal code', () => {
    expect(CODE_CSV_COLUMNS).toEqual(['code_system', 'code', 'description', 'description_source'])
    const row = { codeSystem: 'icd10cm' as const, display: 'F20.0', description: 'Paranoid' }
    expect(codeCsvCells({ ...row, descriptionSource: 'cms' })).toEqual([
      'ICD-10-CM',
      'F20.0',
      'Paranoid',
      'CMS',
    ])
    expect(codeCsvCells({ ...row, descriptionSource: 'GA' })[3]).toBe('GA')
    expect(codeCsvCells({ ...row, description: null, descriptionSource: null })).toEqual([
      'ICD-10-CM',
      'F20.0',
      null,
      null,
    ])
  })

  it('names one column group per state', () => {
    expect(perStateCsvColumns([{ id: 'GA' }, { id: 'MT' }], ['status', 'entry'])).toEqual([
      'GA_status',
      'GA_entry',
      'MT_status',
      'MT_entry',
    ])
  })
})
