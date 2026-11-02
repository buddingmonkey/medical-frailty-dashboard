import { guessColumnRoles, type RawTable } from '@mfcd/shared'
import { describe, expect, it } from 'vitest'

import gaA from './fixtures/pdf-pages-ga-a.json'
import gaB from './fixtures/pdf-pages-ga-b.json'
import la from './fixtures/pdf-pages-la.json'
import mt from './fixtures/pdf-pages-mt.json'
import ne from './fixtures/pdf-pages-ne.json'
import { pageText, type PdfPageText, rebuildPdfTables } from './pdf-layout'

// Real pages from the four seed states' PDFs (text runs only; fixtures/pdf-pages.make.test.ts
// writes them). Each case below is a row this adapter once got wrong.

interface Snapshot {
  source: string
  fonts: string[]
  pages: { page: number; items: (string | number)[][] }[]
}

function load(snapshot: Snapshot): PdfPageText[] {
  return snapshot.pages.map((p) => ({
    page: p.page,
    items: p.items.map(([text, x, y, width, height, font]) => ({
      text: String(text),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
      font: snapshot.fonts[Number(font)] ?? '',
    })),
  }))
}

function read(snapshot: Snapshot) {
  return rebuildPdfTables(load(snapshot), { name: snapshot.source, wrap: 'auto' })
}

/** The row whose code cell is `code`, as header → cell. */
function rowFor(table: RawTable | undefined, code: string): Record<string, string> | undefined {
  if (!table) return undefined
  const col = guessColumnRoles(table.header).indexOf('code')
  const row = table.rows.find((r) => r.cells[col] === code)
  return row && Object.fromEntries(table.header.map((h, i) => [h, row.cells[i] ?? '']))
}

const column = (table: RawTable | undefined, name: string) => {
  const i = table?.header.indexOf(name) ?? -1
  return table?.rows.map((r) => r.cells[i] ?? '') ?? []
}

describe('Georgia (Excel print, wrapped text above the code)', () => {
  it('Attachment A: one table across pages whose columns move', () => {
    const { tables, wrap } = read(gaA)
    expect(wrap).toBe('above')
    expect(tables.map((t) => t.name)).toEqual(['Pages 1–2'])
    expect(tables[0]?.header).toEqual(['Code', 'Code Type', 'Description', 'Yes/ No', 'Rationale'])
    expect(new Set(column(tables[0], 'Code Type'))).toEqual(new Set(['ICD-10-CM']))
    expect(rowFor(tables[0], 'F10.96')?.['Description']).toBe(
      'Alcohol use, unspecified with alcohol-induced persisting amnestic disorder',
    )
    expect(rowFor(tables[0], 'F19.17')?.['Description']).toBe(
      'Other psychoactive substance abuse with psychoactive substance-induced persisting dementia',
    )
  })

  it('Attachment B: a row the state left without a code stays on its own', () => {
    const { tables } = read(gaB)
    const table = tables[0]
    const codeless = table?.rows.filter((r) => r.cells[0] === '')
    expect(codeless).toEqual([
      {
        cells: [
          '',
          '',
          'Nonsuicidal self-harm',
          'Yes',
          'Intentional self-harm - indicates severe psychiatric vulnerability',
        ],
        locator: 'page 60, line 16',
      },
    ])
    expect(rowFor(table, 'F71')?.['Description']).toBe('Moderate intellectual disabilities')
    // "Yes" printed a little below the code line still belongs to its row.
    expect(rowFor(table, 'F13')?.['Rationale']).toBe('Acute condition per new directive')
    expect(rowFor(table, 'F13.121')?.['Description']).toBe(
      'Sedative, hypnotic or anxiolytic abuse with intoxication delirium',
    )
    // Page 151 centers its codes; one wraps its rationale.
    expect(rowFor(table, 'L89.000')?.['Code Type']).toBe('ICD-10-CM')
    expect(rowFor(table, 'L12.1')?.['Rationale']).toBe(
      'Cicatricial pemphigoid - autoimmune blistering disease, can cause scarring, blindness, airway compromise',
    )
    expect(new Set(column(table, 'Yes/ No'))).toEqual(new Set(['Yes']))
  })
})

describe('Louisiana (printed to PDF, wrapped text below the code)', () => {
  const { tables, wrap } = read(la)
  const table = tables[0]

  it('reads the two-line header and every designation', () => {
    expect(wrap).toBe('below')
    expect(tables).toHaveLength(1)
    expect(table?.header).toEqual([
      'Category',
      'Sub-Category',
      'Group',
      'Code Designation',
      'Description',
      'Code',
    ])
    // E08.621-E08.622 has no designation in the source.
    expect(new Set(column(table, 'Code Designation'))).toEqual(new Set(['0', '1', '2', '']))
    expect(rowFor(table, 'E08.621-E08.622')?.['Code Designation']).toBe('')
  })

  it('joins wrapped descriptions and groups', () => {
    expect(rowFor(table, 'F31.10')?.['Description']).toBe(
      'Bipolar disorder, current episode manic without psychotic features, unspecified',
    )
    expect(rowFor(table, 'E11.10')?.['Group']).toBe(
      'ICD-10-CM - Diabetes With Acute or Severe Metabolic Complications',
    )
  })

  it('splits runs that hold two cells, and keeps overflowing text whole', () => {
    expect(rowFor(table, 'H7X')?.['Description']).toBe(
      'ANTIPSYCHOTICS, ATYP, D2 PARTIAL AGONIST/5HT M',
    )
    expect(rowFor(table, 'Z47.31')?.['Description']).toBe(
      'Aftercare following explantation of shoulder joint prosthesis',
    )
    expect(rowFor(table, 'J47.*')).toMatchObject({
      'Code Designation': '0',
      Description: 'Bronchiectasis',
    })
    expect(rowFor(table, 'E0134')?.['Description']).toBe(
      'Rigid walker, wheeled, with enclosed frame (often with an integrated seat/frame structure).',
    )
    // Printed right of the code column on the last page.
    expect(rowFor(table, '47428')?.['Description']).toBe('Brincidofovir')
  })
})

describe('Montana (title, mixed alignment)', () => {
  const { tables, titleText } = read(mt)
  const table = tables[0]

  it('keeps the title text for the state-name check', () => {
    expect(titleText).toContain('Medically Frail')
    expect(titleText).not.toContain('Condition Name')
  })

  it('skips the title lines and reads one tier and category per row', () => {
    expect(table?.header).toEqual(['Category', 'Category', 'Condition Name', 'Code', 'Code Name'])
    // Both columns are headed "Category": the tier is the first, the category the second.
    expect(new Set(table?.rows.map((r) => r.cells[0]))).toEqual(
      new Set(['Tier 1 - DPHHS Approved Condition', 'Tier 2 - Frailty Indicators']),
    )
    expect(table?.rows.every((r) => /^[A-Za-z/, -]+$/.test(r.cells[1] ?? ''))).toBe(true)
  })

  it('code at the bottom of its row (page 2) and at the top (page 4)', () => {
    expect(rowFor(table, 'C78')?.['Code Name']).toBe(
      'Secondary malignant neoplasm of respiratory and digestive organs',
    )
    const f19 = table?.rows.find((r) => r.cells[3] === 'F19.250')?.cells
    expect(f19).toEqual([
      'Tier 1 - DPHHS Approved Condition',
      'SUD',
      'Other psychoactive substance use (including polysubstance use)',
      'F19.250',
      'Other psychoactive substance dependence with psychoactive substance-induced psychotic disorder with delusions',
    ])
  })

  it('keeps the truncated range as printed', () => {
    expect(rowFor(table, 'L89.500-L89')?.['Code Name']).toBe(
      'Pressure ulcer of ankle (right/left/unspecified, all stages)',
    )
  })
})

describe('pageText (the text an AI assistant gets)', () => {
  it('writes a page as lines, top to bottom, with the cells of a line apart', () => {
    const [first] = load(mt)
    if (!first) throw new Error('no page')
    const lines = pageText(first).split('\n')
    expect(lines.findIndex((l) => l.includes('Condition Name'))).toBeLessThan(
      lines.findIndex((l) => /\b[A-Z]\d{2}(\.\w+)?\b/.test(l)),
    )
    expect(lines.find((l) => l.includes('Code Name'))).toMatch(/Code {2,}Code Name/)
  })
})

describe('Nebraska (contents page, chapters, CPT table)', () => {
  const { tables, titleText } = read(ne)

  it('keeps the contents page text for the state-name check', () => {
    expect(titleText).toMatch(/Nebraska/i)
  })

  it('skips the contents page and the page numbers, and starts a table per header', () => {
    expect(tables.map((t) => [t.name, t.header])).toEqual([
      ['Pages 2–294', ['Diagnosis code', 'Description']],
      ['Page 295', ['CPT/HCPC code', 'description']],
    ])
    expect(rowFor(tables[0], 'A0103')?.['Description']).toBe('Typhoid pneumonia')
    expect(tables[0]?.rows.at(-1)?.cells).toEqual(['Z9981', 'Dependence on supplemental oxygen'])
  })

  it('joins codes and descriptions that wrap in the CPT table', () => {
    const cpt = tables[1]
    expect(cpt?.rows).toHaveLength(27)
    expect(rowFor(cpt, '33927, 33928, 33929, 33935, 33945')?.['description']).toBe(
      '(heart transplant)',
    )
    expect(rowFor(cpt, 'E1037-E1224 and E1229-E1295')?.['description']).toBe('wheelchairs')
    expect(rowFor(cpt, 'T2042, X2042, T2043, T2044, T2045.')?.['description']).toBe(
      'Hospice care (home, assisted living, SNF, inpatient, respite, etc.)',
    )
    expect(rowFor(cpt, '90947')?.['description']).toBe(
      'Dialysis procedure other than hemodialysis requiring repeated evaluations by a physician or other qualified health care professional, with or without substantial revision of dialysis prescription',
    )
  })
})
