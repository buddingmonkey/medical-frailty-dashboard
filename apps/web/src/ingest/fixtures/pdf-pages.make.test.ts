import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it } from 'vitest'

import { extractPdfPages } from '../pdf'

// Writes the real-page snapshots used by pdf-layout.fixtures.test.ts. Skipped unless
// PDF_SOURCE_DIR holds the state PDFs (docs/sources.md) under these names:
//   PDF_SOURCE_DIR=~/pdfs pnpm test pdf-pages.make
// Each snapshot keeps only the text runs of the chosen pages, so no PDF is committed.

const SOURCES = [
  // Attachment A: header on page 1, columns move on page 2, wrapped text above the code.
  { file: 'ga-a.pdf', out: 'ga-a', pages: [1, 2] },
  // Attachment B (page 1 for the header): a row with no code at the foot of page 60;
  // centered codes on page 151.
  { file: 'ga-b.pdf', out: 'ga-b', pages: [1, 4, 60, 61, 151] },
  // Two-line header, wrapped text below the code, runs that hold two cells, overflow.
  { file: 'la.pdf', out: 'la', pages: [1, 2, 6, 13, 48, 60, 62, 73] },
  // Title lines, a page that starts mid-row, mixed alignment (page 4), truncated ranges.
  { file: 'mt.pdf', out: 'mt', pages: [1, 2, 4, 7] },
  // Contents page, chapter titles, page footers, the CPT/HCPCS table on the last page.
  { file: 'ne.pdf', out: 'ne', pages: [1, 2, 294, 295] },
]

const dir = process.env['PDF_SOURCE_DIR'] ?? ''
const round = (n: number) => Math.round(n * 100) / 100

describe.skipIf(dir === '')('PDF page snapshots', () => {
  it.each(SOURCES)('writes $out', async ({ file, out, pages }) => {
    const all = await extractPdfPages(new Uint8Array(readFileSync(join(dir, file))), file)
    const fonts: string[] = []
    const fontIndex = (font: string) => {
      if (!fonts.includes(font)) fonts.push(font)
      return fonts.indexOf(font)
    }
    const snapshot = {
      source: file,
      pages: all
        .filter((p) => pages.includes(p.page))
        .map((p) => ({
          page: p.page,
          items: p.items.map((it) => [
            it.text,
            round(it.x),
            round(it.y),
            round(it.width),
            round(it.height),
            fontIndex(it.font),
          ]),
        })),
    }
    const json = JSON.stringify({ ...snapshot, fonts })
    writeFileSync(join(import.meta.dirname, `pdf-pages-${out}.json`), `${json}\n`)
  })
})
