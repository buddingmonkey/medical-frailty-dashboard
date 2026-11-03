import { describe, expect, it } from 'vitest'

import {
  fileTypeFromName,
  MAX_SOURCE_BYTES,
  sha256Hex,
  sniffMatches,
  sourceDetailsSchema,
  sourceListQuerySchema,
  sourceUploadQuerySchema,
} from './sources'

const text = (s: string) => new TextEncoder().encode(s)

describe('fileTypeFromName', () => {
  it.each([
    ['HR1-Codes.PDF', 'pdf'],
    ['DPHHSMedicallyFrailCodeList_092926.pdf', 'pdf'],
    ['codes.xlsx', 'xlsx'],
    ['codes.csv', 'csv'],
    ['codes.json', 'json'],
    ['pasted.txt', 'txt'],
  ])('%s is %s', (name, type) => {
    expect(fileTypeFromName(name)).toBe(type)
  })

  it.each(['codes.xls', 'codes.docx', 'pdf', 'codes.pdf.exe', ''])('refuses %j', (name) => {
    expect(fileTypeFromName(name)).toBeNull()
  })
})

describe('sniffMatches', () => {
  it('knows a PDF by its header, even after a few junk bytes', () => {
    expect(sniffMatches(text('%PDF-1.7\n...'), 'pdf')).toBe(true)
    expect(sniffMatches(text('\n\n%PDF-1.4'), 'pdf')).toBe(true)
    expect(sniffMatches(text('<html>%PDF-'.padStart(2000, ' ')), 'pdf')).toBe(false)
    expect(sniffMatches(text('PK\u0003\u0004'), 'pdf')).toBe(false)
  })

  it('knows an xlsx by its zip header', () => {
    expect(sniffMatches(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]), 'xlsx')).toBe(true)
    expect(sniffMatches(text('%PDF-1.7'), 'xlsx')).toBe(false)
  })

  it('takes text files only without NUL bytes', () => {
    expect(sniffMatches(text('code,description\nF20.0,Paranoid schizophrenia\n'), 'csv')).toBe(true)
    expect(sniffMatches(text('[{"code":"F20.0"}]'), 'json')).toBe(true)
    expect(sniffMatches(new Uint8Array([0x61, 0x00, 0x62]), 'txt')).toBe(false)
  })

  it('refuses an empty file', () => {
    expect(sniffMatches(new Uint8Array(), 'csv')).toBe(false)
  })
})

describe('sha256Hex', () => {
  it('matches the known digest of "abc"', async () => {
    expect(await sha256Hex(text('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

const hash = 'a'.repeat(64)

describe('sourceUploadQuerySchema', () => {
  it('reads the query string, turning blanks into null', () => {
    expect(
      sourceUploadQuerySchema.parse({
        stateId: 'MT',
        title: ' DPHHS Medically Frail Condition List ',
        fileType: 'pdf',
        sha256: hash,
        url: '',
        publisherDate: '',
      }),
    ).toEqual({
      stateId: 'MT',
      title: 'DPHHS Medically Frail Condition List',
      fileType: 'pdf',
      sha256: hash,
      url: null,
      publisherDate: null,
    })
  })

  it.each([
    ['lower-case state', { stateId: 'mt' }],
    ['no title', { title: '' }],
    ['unknown type', { fileType: 'exe' }],
    ['short hash', { sha256: 'abc' }],
    ['upper-case hash', { sha256: 'A'.repeat(64) }],
    ['javascript url', { url: 'javascript:alert(1)' }],
    ['bad date', { publisherDate: '2026-02-30' }],
  ])('rejects %s', (_name, patch) => {
    const base = { stateId: 'MT', title: 'x', fileType: 'pdf', sha256: hash }
    expect(sourceUploadQuerySchema.safeParse({ ...base, ...patch }).success).toBe(false)
  })
})

describe('sourceListQuerySchema', () => {
  it('needs a state; the hash is optional', () => {
    expect(sourceListQuerySchema.parse({ stateId: 'GA' })).toEqual({ stateId: 'GA' })
    expect(sourceListQuerySchema.parse({ stateId: 'GA', sha256: hash })).toEqual({
      stateId: 'GA',
      sha256: hash,
    })
    expect(sourceListQuerySchema.safeParse({}).success).toBe(false)
  })
})

it('caps source files at 25 MB', () => {
  expect(MAX_SOURCE_BYTES).toBe(25 * 1024 * 1024)
})

describe('sourceDetailsSchema', () => {
  const ok = {
    title: 'Medically Frail List',
    url: 'https://example.gov/a.pdf',
    publisherDate: '2026-01-15',
  }

  it('takes a title, an https URL and a past date, or nulls', () => {
    expect(sourceDetailsSchema.parse(ok)).toEqual(ok)
    expect(sourceDetailsSchema.parse({ title: '  T  ', url: null, publisherDate: null })).toEqual({
      title: 'T',
      url: null,
      publisherDate: null,
    })
  })

  it('takes today, in UTC', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(sourceDetailsSchema.safeParse({ ...ok, publisherDate: today }).success).toBe(true)
  })

  it.each([
    ['an empty title', { title: '  ' }],
    ['a long title', { title: 'x'.repeat(201) }],
    ['an http URL', { url: 'http://example.gov/a.pdf' }],
    ['a javascript URL', { url: 'javascript:alert(1)' }],
    ['not a URL', { url: 'example.gov' }],
    ['a long URL', { url: `https://example.gov/${'a'.repeat(2000)}` }],
    ['a future date', { publisherDate: '2999-01-01' }],
    ['not a date', { publisherDate: '01/15/2026' }],
    ['an impossible date', { publisherDate: '2026-02-30' }],
  ])('refuses %s', (_, change) => {
    expect(sourceDetailsSchema.safeParse({ ...ok, ...change }).success).toBe(false)
  })

  it('needs every field', () => {
    expect(sourceDetailsSchema.safeParse({ title: 'T' }).success).toBe(false)
  })
})
