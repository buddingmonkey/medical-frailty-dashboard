import { type CodeSystem, codeSystemLabels, toCsv } from '@mfcd/shared'
import type { Context } from 'hono'

import type { AppEnv } from '../types'

// The code-by-state CSV downloads (`/compare/codes.csv`, `/compare/states/:pair/codes.csv`,
// `/compare/:slug/codes.csv`): the columns they share and the response.

type CsvValue = string | number | null

/** The first four columns of every code-by-state CSV. */
export const CODE_CSV_COLUMNS = ['code_system', 'code', 'description', 'description_source']

/** The cells under CODE_CSV_COLUMNS: `cms` is written `CMS`; a state's own text keeps its postal code. */
export function codeCsvCells(row: {
  codeSystem: CodeSystem
  display: string
  description: string | null
  descriptionSource: string | null
}): CsvValue[] {
  return [
    codeSystemLabels[row.codeSystem],
    row.display,
    row.description,
    row.descriptionSource === 'cms' ? 'CMS' : row.descriptionSource,
  ]
}

/** One column group per state: `GA_status`, `GA_entry`, … */
export const perStateCsvColumns = (
  states: readonly { id: string }[],
  columns: readonly string[],
): string[] => states.flatMap((s) => columns.map((col) => `${s.id}_${col}`))

/** A CSV download with its file name. */
export const csvResponse = (
  c: Context<AppEnv>,
  rows: readonly (readonly CsvValue[])[],
  fileName: string,
): Response =>
  c.body(toCsv(rows), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${fileName}"`,
  })
