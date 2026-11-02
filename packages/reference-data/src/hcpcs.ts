// Parser for CMS's alpha-numeric HCPCS Level II file (HCPC<year>_<MON>_ANWEB_*.txt). Fixed
// width, 320 characters (see HCPC<year>_recordlayout.txt in the same zip): code (1–5),
// record id (11: 3 = procedure, 4 = its continuation, 7/8 = modifier), long description
// (12–91), termination date (285–292, YYYYMMDD). Public domain.
import type { RefCodeRow } from './sql.ts'

function isoDate(yyyymmdd: string): string | null {
  const value = yyyymmdd.trim()
  if (value === '') return null
  if (!/^\d{8}$/.test(value)) throw new Error(`bad date ${value}`)
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

export function parseHcpcsFile(text: string, options: { validFrom: string }): RefCodeRow[] {
  const rows: RefCodeRow[] = []
  let current: RefCodeRow | null = null
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line.trim() === '') return
    const where = `HCPCS file, line ${String(index + 1)}`
    const code = line.slice(0, 5).trim()
    const recordId = line.slice(10, 11)
    const description = line.slice(11, 91).trim()
    switch (recordId) {
      case '3': {
        if (!/^[A-V]\d{4}$/.test(code)) throw new Error(`${where}: unexpected code ${code}`)
        current = {
          codeSystem: 'hcpcs',
          codeNorm: code,
          description,
          parentNorm: null,
          chapter: null,
          billable: null,
          validFrom: options.validFrom,
          validTo: isoDate(line.slice(284, 292)),
        }
        rows.push(current)
        return
      }
      case '4':
        if (current?.codeNorm !== code) {
          throw new Error(`${where}: continuation of ${code} without its first record`)
        }
        current.description = `${current.description} ${description}`
        return
      case '7':
      case '8':
        current = null // modifiers are not codes a state lists
        return
      default:
        throw new Error(`${where}: unknown record id ${JSON.stringify(recordId)}`)
    }
  })
  return rows
}
