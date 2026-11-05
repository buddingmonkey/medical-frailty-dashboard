/** What D1 threw on preview when a statement ran too long (2026-11-04). */
export const D1_CPU_LIMIT = 'D1_ERROR: D1 DB exceeded its CPU time limit and was reset.'

/**
 * The test D1 binding, except that preparing any statement whose SQL matches `pattern` throws
 * D1's CPU-limit error: a recompute that fails after its save's batch committed.
 */
export function failingD1(db: D1Database, pattern: RegExp): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (query: string) => {
          if (pattern.test(query)) throw new Error(D1_CPU_LIMIT)
          return target.prepare(query)
        }
      }
      const value: unknown = Reflect.get(target, prop, receiver)
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value
    },
  })
}
