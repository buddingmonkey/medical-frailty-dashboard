import { describe, expect, it } from 'vitest'

import { csvCell, toCsv } from './csv'

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralises text that a spreadsheet would run as a formula, but not numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-5 mg')).toBe("'-5 mg")
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(null)).toBe('')
  })

  it('joins rows with CRLF and ends with one', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', null],
      ]),
    ).toBe('a,1\r\nb,\r\n')
  })
})
