import { fileTypeFromName, MAX_COLUMNS, MAX_ROWS, type RawRow, type RawTable } from '@mfcd/shared'
// The build for code already inside a Web Worker: it starts no workers of its own.
import readXlsxFile from 'read-excel-file/web-worker'

// Parser adapters (docs/ingestion.md, "Parser adapters"). Pure functions: they run in a Web
// Worker in the browser (worker.ts) and directly in tests.

/** A file we cannot turn into a table. The message is shown to the admin. */
export class ParseError extends Error {
  override name = 'ParseError'
}

export type ParseInput =
  { kind: 'file'; name: string; bytes: Uint8Array } | { kind: 'paste'; text: string }

const QUOTE = '"'

/**
 * RFC 4180 style: quoted cells may hold the delimiter, newlines and doubled quotes. One pass
 * over the text, no regular expressions. The first non-blank record is the header.
 */
export function parseDelimited(text: string, delimiter: string, name: string): RawTable {
  const records: { cells: string[]; line: number }[] = []
  let cells: string[] = []
  let cellText = ''
  let quoted = false
  let line = 1
  let recordLine = 1

  const endCell = () => {
    cells.push(cellText)
    cellText = ''
    if (cells.length > MAX_COLUMNS)
      throw new ParseError(`${name} has more than ${String(MAX_COLUMNS)} columns.`)
  }
  const endRecord = () => {
    endCell()
    records.push({ cells, line: recordLine })
    if (records.length > MAX_ROWS + 1) {
      throw new ParseError(`${name} has more than ${String(MAX_ROWS)} rows.`)
    }
    cells = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (quoted) {
      if (ch === QUOTE) {
        if (text[i + 1] === QUOTE) {
          cellText += QUOTE
          i++
        } else quoted = false
      } else {
        if (ch === '\n') line++
        cellText += ch
      }
    } else if (ch === QUOTE && cellText === '') {
      quoted = true
    } else if (ch === delimiter) {
      endCell()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      cellText += ch
    }
  }
  if (quoted)
    throw new ParseError(`${name} has an unclosed quote (from line ${String(recordLine)}).`)
  if (cellText !== '' || cells.length > 0) endRecord()

  const isBlank = (r: { cells: string[] }) => r.cells.every((c) => c.trim() === '')
  const headerIndex = records.findIndex((r) => !isBlank(r))
  const headerRecord = records[headerIndex]
  if (!headerRecord) throw new ParseError(`${name} is empty.`)
  return {
    name,
    header: headerRecord.cells.map((c) => c.trim()),
    rows: records
      .slice(headerIndex + 1)
      .map((r): RawRow => ({ cells: r.cells, locator: `row ${String(r.line)}` })),
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** An array of objects with any keys; the column mapping decides which key is what. */
export function parseJson(text: string, name: string): RawTable {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ParseError(`${name} is not valid JSON.`)
  }
  if (!Array.isArray(data) || !data.every(isRecord)) {
    throw new ParseError(`${name} must be an array of objects, one per code.`)
  }
  if (data.length > MAX_ROWS)
    throw new ParseError(`${name} has more than ${String(MAX_ROWS)} rows.`)
  const header: string[] = []
  const seen = new Set<string>()
  for (const item of data) {
    for (const key of Object.keys(item)) {
      if (!seen.has(key)) {
        seen.add(key)
        header.push(key)
      }
    }
  }
  if (header.length > MAX_COLUMNS) {
    throw new ParseError(`${name} has more than ${String(MAX_COLUMNS)} keys.`)
  }
  return {
    name,
    header,
    rows: data.map((item, i) => ({
      cells: header.map((key) => cellText(item[key])),
      locator: `item ${String(i + 1)}`,
    })),
  }
}

/** A cell as the text a reader sees. Dates become `YYYY-MM-DD`. */
function xlsxCellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return cellText(value)
}

/** Every sheet of a workbook, one table each. Numbers stay as the text in the cell ("0"). */
export async function parseXlsx(bytes: Uint8Array, name: string): Promise<RawTable[]> {
  let sheets: Awaited<ReturnType<typeof readXlsxFile<string>>>
  try {
    sheets = await readXlsxFile<string>(new Uint8Array(bytes).buffer, {
      parseNumber: (text) => text,
      trim: false,
    })
  } catch {
    throw new ParseError(`${name} is not a readable Excel workbook.`)
  }
  const tables: RawTable[] = []
  for (const { sheet, data } of sheets) {
    if (data.length > MAX_ROWS + 1) {
      throw new ParseError(`Sheet “${sheet}” has more than ${String(MAX_ROWS)} rows.`)
    }
    const rows = data.map((row, i) => ({
      cells: row.map(xlsxCellText),
      line: i + 1,
    }))
    const headerIndex = rows.findIndex((r) => r.cells.some((c) => c.trim() !== ''))
    const headerRow = rows[headerIndex]
    if (!headerRow) continue // An empty sheet.
    if (headerRow.cells.length > MAX_COLUMNS) {
      throw new ParseError(`Sheet “${sheet}” has more than ${String(MAX_COLUMNS)} columns.`)
    }
    tables.push({
      name: sheet,
      header: headerRow.cells.map((c) => c.trim()),
      rows: rows
        .slice(headerIndex + 1)
        .map((r): RawRow => ({ cells: r.cells, locator: `${sheet} row ${String(r.line)}` })),
    })
  }
  if (tables.length === 0) throw new ParseError(`${name} has no sheets with data.`)
  return tables
}

/** Text from bytes; TextDecoder drops a UTF-8 byte-order mark. */
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes)

export function parseSource(input: ParseInput): Promise<RawTable[]> {
  return Promise.resolve().then(async () => {
    if (input.kind === 'paste') return [parseDelimited(input.text, '\t', 'Pasted table')]
    switch (fileTypeFromName(input.name)) {
      case 'csv':
        return [parseDelimited(decode(input.bytes), ',', input.name)]
      case 'txt':
        return [parseDelimited(decode(input.bytes), '\t', input.name)]
      case 'json':
        return [parseJson(decode(input.bytes), input.name)]
      case 'pdf':
        throw new ParseError('PDF parsing is not built yet (roadmap M2 step 5).')
      case 'xlsx':
        return parseXlsx(input.bytes, input.name)
      case null:
        throw new ParseError('Use a CSV, JSON, text, Excel or PDF file.')
    }
  })
}
