// Writes a small PDF for tests: text at given positions in Helvetica (regular or bold), with
// no embedded fonts. Positions are in points from the top-left, like pdf-layout.ts uses.

export interface PdfTextSpec {
  text: string
  x: number
  y: number
  bold?: boolean
  size?: number
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792

/** PDF string literal: escape the three characters that need it. */
const literal = (text: string) => `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`

export function makePdf(pages: PdfTextSpec[][]): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const add = (body: string) => objects.push(body)
  // 1 catalog, 2 page tree, 3 regular font, 4 bold font, then a page and its content per page.
  add('<< /Type /Catalog /Pages 2 0 R >>')
  const kids = pages.map((_, i) => `${String(5 + i * 2)} 0 R`).join(' ')
  add(`<< /Type /Pages /Kids [${kids}] /Count ${String(pages.length)} >>`)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  pages.forEach((items, i) => {
    const content = items
      .map((it) => {
        const font = it.bold ? '/F2' : '/F1'
        const size = String(it.size ?? 10)
        const y = String(PAGE_HEIGHT - it.y)
        return `BT ${font} ${size} Tf ${String(it.x)} ${y} Td ${literal(it.text)} Tj ET`
      })
      .join('\n')
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${String(6 + i * 2)} 0 R >>`,
    )
    add(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${String(i + 1)} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
