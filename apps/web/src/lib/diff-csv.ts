import { codeSystemLabels, type CheckReport } from '@mfcd/shared'

type Change = CheckReport['diff']['changes'][number]

/** A spreadsheet runs a cell that starts with one of these as a formula (CSV injection). */
const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r'])

function cell(value: string | null): string {
  let text = value ?? ''
  if (text !== '' && FORMULA_START.has(text[0] ?? '')) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The draft's diff as CSV (RFC 4180, CRLF), for checking offline. */
export function diffToCsv(changes: readonly Change[]): string {
  const lines = [['change', 'code_system', 'code', 'before', 'after'].join(',')]
  for (const c of changes) {
    lines.push(
      [c.kind, codeSystemLabels[c.codeSystem], c.code, c.before, c.after].map(cell).join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}
