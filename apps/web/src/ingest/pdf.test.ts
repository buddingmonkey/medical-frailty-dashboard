import { describe, expect, it } from 'vitest'

import { makePdf, type PdfTextSpec } from './fixtures/make-pdf'
import { ParseError } from './parse'
import { extractPdfPages, parsePdf } from './pdf'

// The pdf.js side: real PDF bytes in, text runs and tables out. Layout rules are tested in
// pdf-layout.test.ts and on real pages in pdf-layout.fixtures.test.ts.

const header: PdfTextSpec[] = [
  { text: 'Diagnosis code', x: 35, y: 72, bold: true },
  { text: 'Description', x: 136, y: 72, bold: true },
]
const rows = (codes: [string, string][], top: number): PdfTextSpec[] =>
  codes.flatMap(([code, description], i) => [
    { text: code, x: 35, y: top + i * 15 },
    { text: description, x: 136, y: top + i * 15 },
  ])

describe('extractPdfPages', () => {
  it('returns each text run with its position from the top-left and its font', async () => {
    const pages = await extractPdfPages(
      makePdf([[...header, ...rows([['A0103', 'Typhoid pneumonia']], 87)]]),
      'ne.pdf',
    )
    expect(pages).toHaveLength(1)
    const code = pages[0]?.items.find((it) => it.text === 'A0103')
    expect(code?.x).toBeCloseTo(35)
    expect(code?.y).toBeCloseTo(87)
    expect(code?.height).toBeCloseTo(10)
    expect(code?.width).toBeGreaterThan(20)
    const bold = pages[0]?.items.find((it) => it.text === 'Description')
    expect(bold?.font).not.toBe(code?.font)
  })

  it('refuses bytes that are not a PDF', async () => {
    const notPdf = new TextEncoder().encode('%PDF-1.4\nthis is not a real PDF')
    await expect(extractPdfPages(notPdf, 'fake.pdf')).rejects.toThrow(
      new ParseError('fake.pdf is not a readable PDF.'),
    )
  })
})

describe('parsePdf', () => {
  it('reads a table that runs over two pages, header repeated', async () => {
    const bytes = makePdf([
      [
        ...header,
        ...rows(
          [
            ['A0103', 'Typhoid pneumonia'],
            ['A0104', 'Typhoid arthritis'],
          ],
          87,
        ),
      ],
      [
        ...header,
        ...rows([['A021', 'Salmonella sepsis']], 87),
        { text: 'Page 2 of 2', x: 258, y: 757 },
      ],
    ])
    const { tables, wrap } = await parsePdf(bytes, 'ne.pdf', 'auto')
    expect(wrap).toBe('above')
    expect(tables).toEqual([
      {
        name: 'Pages 1–2',
        header: ['Diagnosis code', 'Description'],
        rows: [
          { cells: ['A0103', 'Typhoid pneumonia'], locator: 'page 1, line 1' },
          { cells: ['A0104', 'Typhoid arthritis'], locator: 'page 1, line 2' },
          { cells: ['A021', 'Salmonella sepsis'], locator: 'page 2, line 1' },
        ],
      },
    ])
  })

  it('says so when a PDF has no text (a scan)', async () => {
    await expect(parsePdf(makePdf([[]]), 'scan.pdf', 'auto')).rejects.toThrow(/no text to read/)
  })
})
