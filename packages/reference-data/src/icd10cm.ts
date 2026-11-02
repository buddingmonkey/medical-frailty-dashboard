// Parser for CMS's ICD-10-CM "order" file (icd10cm_order_<year>.txt, in the "Code Descriptions
// in Tabular Order" zip). Fixed width, CRLF: order number (1–5), code (7–13), 1 = billable or
// 0 = header (15), short description (17–76), long description (78–). Public domain.
import { icd10cmChapterOf } from '@mfcd/shared/icd-chapters'

import type { RefCodeRow } from './sql.ts'

// Code shape as in packages/shared/src/codes.ts (`QA` is the only letter allowed in 2nd place).
const LINE = /^(\d{5}) ((?:[A-Z]\d|QA)[0-9A-Z][0-9A-Z]{0,4}) *([01]) (.{60}) (.+)$/

export function parseIcd10cmOrderFile(text: string, options: { validFrom: string }): RefCodeRow[] {
  const rows: RefCodeRow[] = []
  const known = new Set<string>()
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line.trim() === '') return
    const match = LINE.exec(line.trimEnd())
    const [, , code, flag, , long] = match ?? []
    if (!code || !flag || !long) {
      throw new Error(`ICD-10-CM order file, line ${String(index + 1)}: unexpected format`)
    }
    const chapter = icd10cmChapterOf(code)
    if (!chapter) {
      throw new Error(`ICD-10-CM order file, line ${String(index + 1)}: ${code} is in no chapter`)
    }
    known.add(code)
    rows.push({
      codeSystem: 'icd10cm',
      codeNorm: code,
      description: long.trim(),
      parentNorm: null,
      chapter: String(chapter.number),
      billable: flag === '1' ? 1 : 0,
      validFrom: options.validFrom,
      validTo: null,
    })
  })
  // Parent: the nearest shorter code that exists. Placeholder levels (T8450X) are skipped.
  for (const row of rows) {
    for (let length = row.codeNorm.length - 1; length >= 3; length--) {
      const candidate = row.codeNorm.slice(0, length)
      if (known.has(candidate)) {
        row.parentNorm = candidate
        break
      }
    }
  }
  return rows
}
