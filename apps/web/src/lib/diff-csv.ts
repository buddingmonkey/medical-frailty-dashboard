import { type CheckReport, codeSystemLabels, toCsv } from '@mfcd/shared'

type Change = CheckReport['diff']['changes'][number]

/** The draft's diff as CSV (RFC 4180, CRLF), for checking offline. */
export function diffToCsv(changes: readonly Change[]): string {
  return toCsv([
    ['change', 'code_system', 'code', 'before', 'after'],
    ...changes.map((c) => [c.kind, codeSystemLabels[c.codeSystem], c.code, c.before, c.after]),
  ])
}
