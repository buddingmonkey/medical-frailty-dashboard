import { describe, expect, it } from 'vitest'

import { ParseError } from './parse'
import { type PdfPageText, type PdfTextItem, rebuildPdfTables } from './pdf-layout'

// Synthetic pages with the layouts of the real files (positions in points, y from the top).
// The real pages are covered by pdf-layout.fixtures.test.ts.

const HEAD = 'bold'
const BODY = 'regular'

function item(text: string, x: number, y: number, font = BODY, height = 10): PdfTextItem {
  return { text, x, y, width: text.length * height * 0.5, height, font }
}

/** A header line, then one line per entry: [y, ...cells at the given column x]. */
function page(
  number: number,
  columns: number[],
  header: string[] | null,
  lines: [number, ...(string | null)[]][],
): PdfPageText {
  const items: PdfTextItem[] = []
  header?.forEach((text, i) => {
    items.push(item(text, columns[i] ?? 0, 40, HEAD))
  })
  for (const [y, ...cells] of lines) {
    cells.forEach((text, i) => {
      if (text) items.push(item(text, columns[i] ?? 0, y))
    })
  }
  return { page: number, items }
}

const cells = (tables: { rows: { cells: string[] }[] }[], t = 0) =>
  tables[t]?.rows.map((r) => r.cells) ?? []

describe('rebuildPdfTables', () => {
  it('reads a plain table: header, columns by position, one row per line', () => {
    const { tables } = rebuildPdfTables(
      [
        page(
          1,
          [30, 130],
          ['Diagnosis code', 'Description'],
          [
            [60, 'A0103', 'Typhoid pneumonia'],
            [75, 'A0104', 'Typhoid arthritis'],
          ],
        ),
      ],
      { name: 'ne.pdf', wrap: 'auto' },
    )
    expect(tables).toHaveLength(1)
    expect(tables[0]?.header).toEqual(['Diagnosis code', 'Description'])
    expect(cells(tables)).toEqual([
      ['A0103', 'Typhoid pneumonia'],
      ['A0104', 'Typhoid arthritis'],
    ])
    expect(tables[0]?.rows[1]?.locator).toBe('page 1, line 2')
  })

  it('skips title lines above the header and page numbers below the table', () => {
    const p = page(4, [30, 130], ['Code', 'Description'], [[60, 'F20.0', 'Paranoid schizophrenia']])
    p.items.push(item('Medically Frail Condition List', 30, 12, 'title'))
    p.items.push(item('Page 4 of 295', 250, 750))
    const { tables } = rebuildPdfTables([p], { name: 'x.pdf', wrap: 'auto' })
    expect(cells(tables)).toEqual([['F20.0', 'Paranoid schizophrenia']])
  })

  it('assigns a cell to the column it starts in, even when headers are centered (LA)', () => {
    // LA: headers centered over the column, data left-aligned; one code printed far right.
    const items = [
      item('Category', 43, 38, HEAD),
      item('Description', 398, 38, HEAD),
      item('Code', 541, 38, HEAD),
    ]
    const rows: [number, string, string][] = [
      [58, 'SMI', 'Paranoid schizophrenia'],
      [84, 'SMI', 'Disorganized schizophrenia'],
      [111, 'SMI', 'Catatonic schizophrenia'],
    ]
    rows.forEach(([y, cat, desc], i) => {
      items.push(item(cat, 23, y), item(desc, 325, y), item(`F20.${String(i)}`, 512, y))
    })
    items.push(item('Infectious disease', 23, 137), item('Brincidofovir', 325, 137))
    items.push(item('47428', 568, 137))
    const { tables } = rebuildPdfTables([{ page: 1, items }], { name: 'la.pdf', wrap: 'auto' })
    expect(tables[0]?.header).toEqual(['Category', 'Description', 'Code'])
    expect(cells(tables)).toEqual([
      ['SMI', 'Paranoid schizophrenia', 'F20.0'],
      ['SMI', 'Disorganized schizophrenia', 'F20.1'],
      ['SMI', 'Catatonic schizophrenia', 'F20.2'],
      ['Infectious disease', 'Brincidofovir', '47428'],
    ])
  })

  it('splits a run that crosses into the next column at the nearest space (LA)', () => {
    // LA's printer wrote the description and a close code as one run.
    const items = [item('Description', 325, 38, HEAD), item('Code', 512, 38, HEAD)]
    for (const [y, code] of [
      [58, 'F20.0'],
      [84, 'F20.1'],
      [111, 'F20.2'],
    ] as const) {
      items.push(item('Schizophrenia', 325, y), item(code, 512, y))
    }
    items.push({
      ...item('ANTIPSYCHOTICS, ATYP, D2 PARTIAL AGONIST/5HT M H7X', 325, 137),
      width: 202,
    })
    // Text that overflows under the next column (clipped on paper) stays whole.
    const overflow = 'Rigid walker, wheeled, with enclosed frame (often with a seat).'
    items.push({ ...item(overflow, 325, 163), width: 283 }, item('E0134', 513, 163))
    items.push({
      ...item('Closed treatment of femoral neck fracture, with or', 325, 172),
      width: 286,
    })
    const { tables } = rebuildPdfTables([{ page: 1, items }], { name: 'la.pdf', wrap: 'below' })
    expect(cells(tables).slice(-2)).toEqual([
      ['ANTIPSYCHOTICS, ATYP, D2 PARTIAL AGONIST/5HT M', 'H7X'],
      [`${overflow} Closed treatment of femoral neck fracture, with or`, 'E0134'],
    ])
  })

  it('splits a one-word cell printed into the same run as the next cell (LA "0 Bronchiectasis")', () => {
    const items = [
      item('Designation', 285, 38, HEAD),
      item('Description', 398, 38, HEAD),
      item('Code', 541, 38, HEAD),
    ]
    for (const y of [58, 84, 111]) {
      items.push(item('0', 293, y), item('Asthma', 325, y), item('J45', 513, y))
    }
    items.push({ ...item('0 Bronchiectasis', 318, 137), width: 53 }, item('J47.*', 513, 137))
    const { tables } = rebuildPdfTables([{ page: 1, items }], { name: 'la.pdf', wrap: 'below' })
    expect(cells(tables).at(-1)).toEqual(['0', 'Bronchiectasis', 'J47.*'])
  })

  it('joins a header written on two lines (LA "Code / Designation")', () => {
    const items = [
      item('Code', 285, 38, HEAD),
      item('Designation', 275, 47, HEAD),
      item('Description', 398, 38, HEAD),
      item('Code', 541, 38, HEAD),
    ]
    for (const y of [58, 84])
      items.push(item('0', 293, y), item('Text', 325, y), item('F21', 512, y))
    const { tables } = rebuildPdfTables([{ page: 1, items }], { name: 'la.pdf', wrap: 'auto' })
    expect(tables[0]?.header).toEqual(['Code Designation', 'Description', 'Code'])
    expect(cells(tables)).toHaveLength(2)
  })

  it('wrap "below": lines without a code continue the row above (LA)', () => {
    const { tables, wrap } = rebuildPdfTables(
      [
        page(
          1,
          [30, 400],
          ['Description', 'Code'],
          [
            [60, 'Bipolar disorder, current episode manic without psychotic', 'F31.10'],
            [69, 'features, unspecified', null],
            [95, 'Hypomania', 'F30.0'],
          ],
        ),
      ],
      { name: 'la.pdf', wrap: 'below' },
    )
    expect(wrap).toBe('below')
    expect(cells(tables)).toEqual([
      ['Bipolar disorder, current episode manic without psychotic features, unspecified', 'F31.10'],
      ['Hypomania', 'F30.0'],
    ])
  })

  it('wrap "above": lines without a code belong to the next code (GA, MT, NE)', () => {
    const { tables } = rebuildPdfTables(
      [
        page(
          1,
          [54, 171, 494],
          ['Code', 'Description', 'Yes/ No'],
          [
            [85, 'F10.26', 'Alcohol dependence with amnestic disorder', 'Yes'],
            [100, null, 'Other psychoactive substance abuse with psychoactive substance-', null],
            [115, 'F19.17', 'induced persisting dementia', 'Yes'],
          ],
        ),
      ],
      { name: 'ga.pdf', wrap: 'above' },
    )
    expect(cells(tables)).toEqual([
      ['F10.26', 'Alcohol dependence with amnestic disorder', 'Yes'],
      [
        'F19.17',
        'Other psychoactive substance abuse with psychoactive substance-induced persisting dementia',
        'Yes',
      ],
    ])
  })

  it('auto-detects "above" from a continuation that starts in lower case on the code line', () => {
    const lines: [number, ...(string | null)[]][] = [
      [60, '90935', 'Hemodialysis procedure'],
      [74, null, 'Hemodialysis procedure requiring repeated evaluations with or without'],
      [88, '90937', 'substantial revisions of dialysis prescription'],
    ]
    const { wrap, tables } = rebuildPdfTables(
      [page(1, [35, 155], ['CPT/HCPC code', 'description'], lines)],
      { name: 'ne.pdf', wrap: 'auto' },
    )
    expect(wrap).toBe('above')
    expect(cells(tables)[1]?.[0]).toBe('90937')
  })

  it('auto-detects "below" from a lower-case line after the code line', () => {
    const { wrap } = rebuildPdfTables(
      [
        page(
          1,
          [30, 330],
          ['Description', 'Code'],
          [
            [60, 'Other psychotic disorder not due to a substance or known', 'F28'],
            [69, 'physiological condition', null],
            [95, 'Hypomania', 'F30.0'],
          ],
        ),
      ],
      { name: 'la.pdf', wrap: 'auto' },
    )
    expect(wrap).toBe('below')
  })

  it('auto-detects "above" from a page that starts with a line without a code (MT)', () => {
    const header = ['Code', 'Code Name']
    const { wrap, tables } = rebuildPdfTables(
      [
        page(1, [521, 564], header, [[60, 'C77', 'Secondary neoplasm of lymph nodes']]),
        page(2, [521, 564], null, [
          [11, null, 'Secondary malignant neoplasm of respiratory and digestive'],
          [23, 'C78', 'Organs'],
        ]),
      ],
      { name: 'mt.pdf', wrap: 'auto' },
    )
    expect(wrap).toBe('above')
    expect(cells(tables)).toEqual([
      ['C77', 'Secondary neoplasm of lymph nodes'],
      ['C78', 'Secondary malignant neoplasm of respiratory and digestive Organs'],
    ])
  })

  it('auto: splits each gap on its own when a file mixes alignments (MT)', () => {
    // Pages 3–4: code at the top of its row, tier at the bottom. Page 2: code at the bottom.
    const tier = 'Tier 1 - DPHHS Approved Condition'
    const { tables } = rebuildPdfTables(
      [
        page(
          1,
          [23, 164, 521, 564],
          ['Category', 'Category', 'Code', 'Code Name'],
          [
            [69, null, null, 'F19.24', 'Other psychoactive substance dependence with psychoactive'],
            [80, tier, 'SUD', null, 'substance-induced mood disorder'],
            [92, null, null, 'F19.25', 'Other psychoactive substance dependence with psychoactive'],
            [103, tier, 'SUD', null, 'substance-induced psychotic disorder'],
            [
              115,
              null,
              null,
              'F19.250',
              'Other psychoactive substance dependence with psychoactive',
            ],
            [126, null, null, null, 'substance-induced psychotic disorder with delusions'],
            [137, tier, 'SUD', null, null],
            [
              149,
              null,
              null,
              'F19.251',
              'Other psychoactive substance dependence with psychoactive',
            ],
            [161, null, null, null, 'substance-induced psychotic disorder with hallucinations'],
            [172, tier, 'SUD', null, null],
            [184, null, null, null, 'Secondary malignant neoplasm of respiratory and digestive'],
            [195, tier, 'SCMC', 'C78', 'organs'],
          ],
        ),
      ],
      { name: 'mt.pdf', wrap: 'auto' },
    )
    const psych = 'Other psychoactive substance dependence with psychoactive substance-induced'
    expect(cells(tables)).toEqual([
      [tier, 'SUD', 'F19.24', `${psych} mood disorder`],
      [tier, 'SUD', 'F19.25', `${psych} psychotic disorder`],
      [tier, 'SUD', 'F19.250', `${psych} psychotic disorder with delusions`],
      [tier, 'SUD', 'F19.251', `${psych} psychotic disorder with hallucinations`],
      [tier, 'SCMC', 'C78', 'Secondary malignant neoplasm of respiratory and digestive organs'],
    ])
  })

  it('auto: keeps a complete row the state left without a code on its own (GA-B page 60)', () => {
    const header = ['Code', 'Code Type', 'Description', 'Yes/ No']
    const { tables } = rebuildPdfTables(
      [
        page(1, [52, 109, 185, 526], header, [
          [268, 'X83.8XXS', 'ICD-10-CM', 'Intentional self-harm, sequela', 'Yes'],
          [283, null, null, 'Nonsuicidal self-harm', 'Yes'],
        ]),
        page(2, [58, 94, 160, 433], header, [
          [70, 'F71', 'ICD-10-CM', 'Moderate intellectual disabilities', 'Yes'],
        ]),
      ],
      { name: 'ga-b.pdf', wrap: 'auto' },
    )
    expect(cells(tables)).toEqual([
      ['X83.8XXS', 'ICD-10-CM', 'Intentional self-harm, sequela', 'Yes'],
      ['', '', 'Nonsuicidal self-harm', 'Yes'],
      ['F71', 'ICD-10-CM', 'Moderate intellectual disabilities', 'Yes'],
    ])
    expect(tables[0]?.rows[1]?.locator).toBe('page 1, line 2')
  })

  it('keeps reading a code that wraps after a comma, hyphen or "and" (NE)', () => {
    const { tables } = rebuildPdfTables(
      [
        page(
          1,
          [35, 155],
          ['CPT/HCPC code', 'description'],
          [
            [60, '33927, 33928, 33929,', null],
            [74, '33935, 33945', '(heart transplant)'],
            [88, 'E1037-E1224 and E1229-', null],
            [102, 'E1295', 'wheelchairs'],
          ],
        ),
      ],
      { name: 'ne.pdf', wrap: 'above' },
    )
    expect(cells(tables)).toEqual([
      ['33927, 33928, 33929, 33935, 33945', '(heart transplant)'],
      ['E1037-E1224 and E1229-E1295', 'wheelchairs'],
    ])
  })

  it('does not join the next row to a code that only ends in a stray comma (NE "E09.349,")', () => {
    const { tables } = rebuildPdfTables(
      [
        page(
          1,
          [35, 136],
          ['Diagnosis code', 'Description'],
          [
            [60, 'E09.349,', 'Drug induced diabetes with retinopathy'],
            [75, 'E0901', 'Drug induced diabetes with coma'],
          ],
        ),
      ],
      { name: 'ne.pdf', wrap: 'above' },
    )
    expect(cells(tables).map((r) => r[0])).toEqual(['E09.349,', 'E0901'])
  })

  it('skips the header where it repeats, and follows columns that move between pages (GA)', () => {
    const header = ['Code', 'Code Type', 'Description']
    const { tables } = rebuildPdfTables(
      [
        page(1, [54, 107, 171], header, [[85, 'F10.26', 'ICD-10-CM', 'Amnestic disorder']]),
        page(2, [41, 87, 156], null, [[30, 'F25', 'ICD-10-CM', 'Schizoaffective disorders']]),
        page(3, [41, 172, 231], header, [[85, 'Z99.2', 'ICD-10-CM', 'Renal dialysis']]),
      ],
      { name: 'ga.pdf', wrap: 'auto' },
    )
    expect(tables).toHaveLength(1)
    expect(tables[0]?.name).toBe('Pages 1–3')
    expect(cells(tables)).toEqual([
      ['F10.26', 'ICD-10-CM', 'Amnestic disorder'],
      ['F25', 'ICD-10-CM', 'Schizoaffective disorders'],
      ['Z99.2', 'ICD-10-CM', 'Renal dialysis'],
    ])
  })

  it('starts a new table where the header changes (NE ICD pages, then CPT)', () => {
    const { tables } = rebuildPdfTables(
      [
        { page: 1, items: [item('Table of contents', 30, 40), item('CPT/HCPC code', 30, 60)] },
        page(2, [35, 136], ['Diagnosis code', 'Description'], [[87, 'A0103', 'Typhoid']]),
        page(3, [35, 136], ['Diagnosis code', 'Description'], [[87, 'A0104', 'Arthritis']]),
        page(4, [35, 155], ['CPT/HCPC code', 'description'], [[71, '47135', 'Liver']]),
      ],
      { name: 'ne.pdf', wrap: 'auto' },
    )
    expect(tables.map((t) => t.name)).toEqual(['Pages 2–3', 'Page 4'])
    expect(tables.map((t) => t.header[0])).toEqual(['Diagnosis code', 'CPT/HCPC code'])
    expect(cells(tables, 0)).toEqual([
      ['A0103', 'Typhoid'],
      ['A0104', 'Arthritis'],
    ])
  })

  it('refuses a file with no text (a scanned image)', () => {
    expect(() =>
      rebuildPdfTables([{ page: 1, items: [] }], { name: 'scan.pdf', wrap: 'auto' }),
    ).toThrow(new ParseError('scan.pdf has no text to read. It may be a scanned image.'))
  })

  it('refuses a file with no header that names a code column', () => {
    const p = page(1, [30, 130], null, [[60, 'Some', 'Prose']])
    expect(() => rebuildPdfTables([p], { name: 'memo.pdf', wrap: 'auto' })).toThrow(
      /no table header with a code column/,
    )
  })
})
