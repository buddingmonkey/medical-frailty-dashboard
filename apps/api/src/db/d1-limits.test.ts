import { describe, expect, it } from 'vitest'

import { chunk, D1_MAX_PARAMS, rowsPerInsert } from './d1-limits'

describe('chunk', () => {
  it('slices in order, the last slice short', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 100)).toEqual([])
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
  })
})

describe('rowsPerInsert', () => {
  it('keeps every row of an insert within the parameter limit', () => {
    expect(D1_MAX_PARAMS).toBe(100)
    expect(rowsPerInsert([{ a: 1, b: 2, c: 3 }])).toBe(33)
    expect(rowsPerInsert([])).toBe(100)
    const wide = Object.fromEntries([...Array(120).keys()].map((k) => [String(k), k]))
    expect(rowsPerInsert([wide])).toBe(1)
  })
})
