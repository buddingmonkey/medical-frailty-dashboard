import { describe, expect, it } from 'vitest'

import { icd10cmChapterOf, icd10cmChapters } from './icd-chapters'

describe('ICD-10-CM chapters', () => {
  it('has 22 chapters numbered in order', () => {
    expect(icd10cmChapters.map((c) => c.number)).toEqual(
      Array.from({ length: 22 }, (_, i) => i + 1),
    )
  })

  it.each([
    ['A000', 1],
    ['B99', 1],
    ['C7A010', 2], // letter in 3rd place sorts inside C00-D49
    ['D3A', 2],
    ['D50', 3],
    ['F200', 5],
    ['H5900', 7],
    ['H60', 8],
    ['O9A1', 15], // last category of chapter 15
    ['Q999', 17],
    ['QA00101', 17], // FY2027 added QA0–QA1 after Q99
    ['QA1798', 17],
    ['S72001A', 19],
    ['T8450XA', 19],
    ['V0000XA', 20],
    ['Z3A00', 21],
    ['U071', 22],
  ])('%s is in chapter %i', (code, chapter) => {
    expect(icd10cmChapterOf(code)?.number).toBe(chapter)
  })

  it('returns null for codes outside every chapter', () => {
    expect(icd10cmChapterOf('F00')).toBeNull() // chapter 5 starts at F01
    expect(icd10cmChapterOf('U99')).toBeNull()
  })
})
