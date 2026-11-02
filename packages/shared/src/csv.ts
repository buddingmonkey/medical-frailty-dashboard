// CSV writing for downloads (admin diff, public state lists): RFC 4180 with CRLF line ends.

/** A spreadsheet runs a cell that starts with one of these as a formula (CSV injection). */
const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r'])

/** One cell: quoted when needed; a leading formula character is neutralised with `'`. */
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  if (typeof value === 'string' && text !== '' && FORMULA_START.has(text[0] ?? '')) {
    text = `'${text}`
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
