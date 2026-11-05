// D1's limits on one statement, in one place (docs/architecture.md).

/** D1 binds at most 100 parameters per statement. */
export const D1_MAX_PARAMS = 100

/** `items` in consecutive slices of at most `size` (at least 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step))
  return out
}

/**
 * Rows per multi-row insert: every column of a row is one parameter, so adding a column never
 * breaks the limit. Reads the columns of the first row.
 */
export function rowsPerInsert(rows: readonly object[]): number {
  return Math.max(1, Math.floor(D1_MAX_PARAMS / Object.keys(rows[0] ?? { x: 0 }).length))
}
