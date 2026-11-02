import { describe, expect, it } from 'vitest'

import { diffToCsv } from './diff-csv'

describe('diffToCsv', () => {
  it('writes a header and one line per change, quoting where needed', () => {
    const csv = diffToCsv([
      { kind: 'added', codeSystem: 'icd10cm', code: 'F20.0', before: null, after: 'SMI' },
      {
        kind: 'description_changed',
        codeSystem: 'cpt',
        code: '32851-32854',
        before: 'Lung transplant, "single"',
        after: 'Lung transplant; single, with bypass',
      },
    ])
    expect(csv.split('\r\n')).toEqual([
      'change,code_system,code,before,after',
      'added,ICD-10-CM,F20.0,,SMI',
      'description_changed,CPT,32851-32854,"Lung transplant, ""single""","Lung transplant; single, with bypass"',
      '',
    ])
  })

  it('defuses cells a spreadsheet would run as a formula', () => {
    const csv = diffToCsv([
      {
        kind: 'removed',
        codeSystem: 'other',
        code: 'X1',
        before: '=HYPERLINK("x")',
        after: '@SUM',
      },
    ])
    expect(csv).toContain(`"'=HYPERLINK(""x"")",'@SUM`)
  })
})
