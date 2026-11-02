import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ParseError, parseDelimited, parseJson, parseSource } from './parse'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('parseDelimited (CSV)', () => {
  it('reads a header and rows with file row numbers as locators', () => {
    expect(
      parseDelimited('Code,Description\r\nF20.0,Schizophrenia\nG35,MS\n', ',', 'mt.csv'),
    ).toEqual({
      name: 'mt.csv',
      header: ['Code', 'Description'],
      rows: [
        { cells: ['F20.0', 'Schizophrenia'], locator: 'row 2' },
        { cells: ['G35', 'MS'], locator: 'row 3' },
      ],
    })
  })

  it('handles quotes, doubled quotes, commas and newlines inside quotes', () => {
    const table = parseDelimited(
      'Code,Description\n"F20.0","Paranoid, ""acute""\nschizophrenia"\nG35,x\n',
      ',',
      'f.csv',
    )
    expect(table.rows[0]?.cells).toEqual(['F20.0', 'Paranoid, "acute"\nschizophrenia'])
    expect(table.rows[1]?.locator).toBe('row 4')
  })

  it('skips blank lines before the header', () => {
    expect(parseDelimited('\n\nCode\nF20.0', ',', 'f.csv').header).toEqual(['Code'])
  })

  it('refuses an empty file and an unclosed quote', () => {
    expect(() => parseDelimited('\n \n', ',', 'f.csv')).toThrow(ParseError)
    expect(() => parseDelimited('Code\n"F20.0', ',', 'f.csv')).toThrow('unclosed quote')
  })

  it('refuses more than 100 columns', () => {
    expect(() => parseDelimited(Array(101).fill('c').join(','), ',', 'f.csv')).toThrow(
      'more than 100 columns',
    )
  })
})

describe('parseJson', () => {
  it('takes an array of objects; the header is every key in first-seen order', () => {
    expect(
      parseJson('[{"code":"F20.0","desc":"S"},{"code":"G35","tier":1,"extra":null}]', 'f.json'),
    ).toEqual({
      name: 'f.json',
      header: ['code', 'desc', 'tier', 'extra'],
      rows: [
        { cells: ['F20.0', 'S', '', ''], locator: 'item 1' },
        { cells: ['G35', '', '1', ''], locator: 'item 2' },
      ],
    })
  })

  it('refuses anything else', () => {
    expect(() => parseJson('{"code":"F20.0"}', 'f.json')).toThrow('array of objects')
    expect(() => parseJson('[1,2]', 'f.json')).toThrow('array of objects')
    expect(() => parseJson('not json', 'f.json')).toThrow('not valid JSON')
  })
})

describe('parseSource', () => {
  it('parses a CSV file, dropping a byte-order mark', async () => {
    const [table] = await parseSource({
      kind: 'file',
      name: 'mt.csv',
      bytes: bytes('﻿Code\nF20.0'),
    })
    expect(table?.header).toEqual(['Code'])
  })

  it('parses pasted spreadsheet cells as tab-separated', async () => {
    const [table] = await parseSource({ kind: 'paste', text: 'Code\tDescription\nF20.0\tS' })
    expect(table).toEqual({
      name: 'Pasted table',
      header: ['Code', 'Description'],
      rows: [{ cells: ['F20.0', 'S'], locator: 'row 2' }],
    })
  })

  it('reads every sheet of an Excel file, numbers kept as the text in the cell', async () => {
    // fixtures/sample.xlsx comes from fixtures/make-sample-xlsx.py.
    const xlsx = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/sample.xlsx')))
    const tables = await parseSource({ kind: 'file', name: 'sample.xlsx', bytes: xlsx })

    expect(tables.map((t) => t.name)).toEqual(['LA', 'MT'])
    expect(tables[0]?.header).toEqual([
      'Category',
      'Sub-Category',
      'Group',
      'Code Designation',
      'Description',
      'Code',
    ])
    expect(tables[0]?.rows[0]).toEqual({
      cells: ['Mental Health', 'SMI', 'G1', '0', 'Schizophrenia', 'F20.0'],
      locator: 'LA row 2',
    })
    expect(tables[0]?.rows.at(-1)).toEqual({
      cells: ['Mental Health', 'SMI', 'G1', '2', 'Depression, unspecified', 'F32.9'],
      locator: 'LA row 4',
    })
    expect(tables[1]?.rows[0]?.cells).toEqual([
      'Tier 1',
      'Physical',
      'MS',
      'G35',
      'Multiple sclerosis',
    ])
  })

  it('refuses a file named .xlsx that is not a workbook', async () => {
    await expect(
      parseSource({ kind: 'file', name: 'a.xlsx', bytes: bytes('not a zip') }),
    ).rejects.toThrow('not a readable Excel workbook')
  })

  it('says which file types are not supported yet', async () => {
    await expect(
      parseSource({ kind: 'file', name: 'a.pdf', bytes: bytes('%PDF-') }),
    ).rejects.toThrow('PDF')
    await expect(parseSource({ kind: 'file', name: 'a.docx', bytes: bytes('x') })).rejects.toThrow(
      ParseError,
    )
  })
})
