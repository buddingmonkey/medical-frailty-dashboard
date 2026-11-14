import { strToU8, Zip, ZipDeflate, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  BackupError,
  BACKUP_TABLES,
  diffMappings,
  type FullBackup,
  parseBackup,
  readBackupBytes,
  restorePlan,
  restoredFileType,
  RESTORED_PART,
} from './backup'

const sha = (n: number) => String(n).padStart(64, '0')

const entryRow = (id: number, versionId: number, patch: Record<string, unknown> = {}) => ({
  id,
  versionId,
  codeSystem: 'icd10cm',
  rawCode: 'F20.0',
  codeNorm: 'F200',
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: 0,
  descriptionPublished: 'Paranoid schizophrenia',
  stateCategory: 'Behavioral Health',
  stateSubcategory: '',
  tier: null,
  attributesJson: null,
  qualification: 'standalone',
  qualificationBasis: 'published',
  sourceDocumentId: 7,
  sourceLocator: null,
  sourcePart: '',
  stateFederalCategories: null,
  ...patch,
})

const versionRow = (id: number, versionNo: number, stateId = 'LA') => ({
  id,
  stateId,
  versionNo,
  status: 'published',
  label: null,
  effectiveDate: null,
  statePublishedDate: '2026-09-01',
  contentUpdatedAt: null,
  createdBy: 'admin@example.org',
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedBy: 'admin@example.org',
  publishedAt: '2026-10-02T00:00:00.000Z',
  checkReportJson: null,
  rowCount: 2,
})

const source = { id: 7, title: 'LA HR1 codes', url: null, publisherDate: null, sha256: sha(7) }

/** A format 1 file as apps/api/src/db/backup.ts writes it. */
const formatOne = () => ({
  format: 1,
  writtenAt: '2026-11-01T00:00:00.000Z',
  version: versionRow(3, 2),
  sources: [source],
  parts: [
    {
      versionId: 3,
      sourceDocumentId: 7,
      part: 'Pages 1-4',
      expectedEntries: 2,
      invalidRowCount: 1,
      namedStateIdsJson: '["LA"]',
    },
  ],
  entries: [
    entryRow(1, 3, { sourcePart: 'Pages 1-4' }),
    entryRow(2, 3, {
      rawCode: 'N18.6',
      codeNorm: 'N186',
      sourcePart: 'Pages 1-4',
      attributesJson: '{"included":false,"flags":[]}',
      tier: 'A',
      sourceLocator: 'row 9',
    }),
  ],
})

function formatTwo(): FullBackup {
  const tables = Object.fromEntries(
    BACKUP_TABLES.map((t) => [t, []]),
  ) as unknown as FullBackup['tables']
  return {
    format: 2,
    writtenAt: '2026-11-03T12:00:00.000Z',
    environment: 'preview',
    migration: '0014_condition_groups_seed',
    dataVersion: 12,
    notes: [],
    tables: {
      ...tables,
      states: [
        { id: 'LA', name: 'Louisiana' },
        { id: 'MT', name: 'Montana' },
      ],
      source_documents: [{ ...source, stateId: 'LA', fileType: 'pdf', byteSize: 10 }],
      dataset_versions: [versionRow(3, 2), versionRow(1, 1)],
      version_sources: [
        { versionId: 3, sourceDocumentId: 7 },
        { versionId: 1, sourceDocumentId: 7 },
      ],
      entries: [
        entryRow(1, 3),
        entryRow(2, 3, { rawCode: 'N18.6', codeNorm: 'N186' }),
        entryRow(3, 1),
      ],
      category_mappings: [
        {
          stateId: 'LA',
          stateCategory: 'Behavioral Health',
          stateSubcategory: '',
          federalCategory: 'disabling_mental_disorder',
          method: 'manual',
          confidence: null,
          mappedBy: 'admin@example.org',
          mappedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    },
    complete: true,
  }
}

const bytes = (text: string) => new TextEncoder().encode(text)

function concat(chunks: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return all
}

describe('parseBackup', () => {
  it('reads a format 1 per-publish backup', () => {
    const bundle = parseBackup(JSON.stringify(formatOne()))
    expect(bundle.format).toBe(1)
    expect(bundle.environment).toBeNull()
    expect(bundle.mappings).toBeNull()
    expect(bundle.versions).toHaveLength(1)
    expect(bundle.versions[0]?.entries).toHaveLength(2)
  })

  it('reads a full backup into versions per state, newest first, with mappings', () => {
    const bundle = parseBackup(JSON.stringify(formatTwo()))
    expect(bundle.format).toBe(2)
    expect(bundle.environment).toBe('preview')
    expect(bundle.stateNames).toEqual({ LA: 'Louisiana', MT: 'Montana' })
    expect(bundle.versions.map((v) => [v.version.id, v.entries.length])).toEqual([
      [3, 2],
      [1, 1],
    ])
    expect(bundle.versions[0]?.sources.map((s) => s.id)).toEqual([7])
    expect(bundle.mappings?.['LA']?.categoryMappings).toHaveLength(1)
    expect(bundle.mappings?.['MT']).toEqual({
      categoryMappings: [],
      chapterMappings: [],
      columnProfiles: [],
    })
  })

  it('refuses an unknown format, a cut-off file and something else', () => {
    expect(() => parseBackup(JSON.stringify({ ...formatOne(), format: 3 }))).toThrow(
      /Unknown backup format 3/,
    )
    const full = JSON.stringify(formatTwo())
    expect(() => parseBackup(full.slice(0, full.length - 20))).toThrow(/not valid JSON/)
    expect(() => parseBackup(JSON.stringify({ ...formatTwo(), complete: false }))).toThrow(
      BackupError,
    )
    expect(() => parseBackup('[1,2]')).toThrow(/not a backup/)
    expect(() => parseBackup(JSON.stringify({ ...formatOne(), entries: 'x' }))).toThrow(
      /format 1 backup does not read \(entries/,
    )
  })
})

describe('restorePlan', () => {
  it('turns entries into draft entries grouped by source and part', () => {
    const [version] = parseBackup(JSON.stringify(formatOne())).versions
    if (!version) throw new Error('no version')
    const plan = restorePlan(version)
    expect(plan.problems).toEqual([])
    expect(plan.parts).toHaveLength(1)
    const [part] = plan.parts
    expect(part).toMatchObject({
      backupSourceId: 7,
      part: 'Pages 1-4',
      invalidRowCount: 1,
      namedStateIds: ['LA'],
    })
    expect(part?.entries[0]).toMatchObject({
      rawCode: 'F20.0',
      tier: '',
      sourceLocator: '',
      attributes: { included: true, flags: [] },
    })
    expect(part?.entries[1]).toMatchObject({
      tier: 'A',
      sourceLocator: 'row 9',
      attributes: { included: false, flags: [] },
    })
  })

  it('keeps a state’s own federal categories, and reads older backups without them', () => {
    const file = formatOne()
    file.entries[0] = entryRow(1, 3, { stateFederalCategories: 'sud,serious_complex_medical' })
    const [version] = parseBackup(JSON.stringify(file)).versions
    if (!version) throw new Error('no version')
    const [part] = restorePlan(version).parts
    expect(part?.entries[0]?.stateFederalCategories).toEqual(['sud', 'serious_complex_medical'])
    expect(part?.entries[1]?.stateFederalCategories).toBeUndefined()
  })

  it('names a part for entries stored without one', () => {
    const [version] = parseBackup(JSON.stringify(formatTwo())).versions
    if (!version) throw new Error('no version')
    expect(restorePlan(version).parts.map((p) => p.part)).toEqual([RESTORED_PART])
  })

  it('reports entries that would not pass the draft API', () => {
    const file = formatOne()
    file.entries[0] = entryRow(1, 3, { codeNorm: 'F201' })
    file.entries[1] = entryRow(2, 3, { sourceDocumentId: 99 })
    const [version] = parseBackup(JSON.stringify(file)).versions
    if (!version) throw new Error('no version')
    const plan = restorePlan(version)
    expect(plan.problems).toEqual([
      'Entry 1: “F20.0” does not match the code sent with it.',
      'Entry 2 cites a source the backup does not hold.',
    ])
    expect(plan.parts).toEqual([])
  })
})

describe('readBackupBytes', () => {
  const json = JSON.stringify(formatTwo())

  it('reads a bare JSON file', () => {
    expect(readBackupBytes(bytes(json))).toBe(json)
  })

  it('reads a zip holding one .json file, deflated or stored', () => {
    expect(readBackupBytes(zipSync({ 'frailty-backup.json': strToU8(json) }))).toBe(json)
    expect(readBackupBytes(zipSync({ 'b.json': [strToU8(json), { level: 0 }] }))).toBe(json)
  })

  it('reads a zip written as a stream (no sizes in the local header)', () => {
    const out: Uint8Array[] = []
    const zip = new Zip((err, chunk) => {
      if (err) throw err
      out.push(chunk)
    })
    const file = new ZipDeflate('b.json')
    zip.add(file)
    file.push(strToU8(json.slice(0, 100)))
    file.push(strToU8(json.slice(100)), true)
    zip.end()
    expect(readBackupBytes(concat(out))).toBe(json)
  })

  it('refuses more than one entry, other names and paths', () => {
    const two = zipSync({ 'a.json': strToU8(json), 'b.json': strToU8(json) })
    expect(() => readBackupBytes(two)).toThrow(/exactly one \.json file/)
    expect(() => readBackupBytes(zipSync({ 'a.txt': strToU8(json) }))).toThrow(/expected one/)
    expect(() => readBackupBytes(zipSync({ 'x/../a.json': strToU8(json) }))).toThrow(/expected one/)
    expect(() => readBackupBytes(zipSync({ 'dir/a.json': strToU8(json) }))).toThrow(/expected one/)
  })

  it('refuses a file over the limit before reading it', () => {
    expect(() => readBackupBytes(bytes(json), 100)).toThrow(/larger than/)
    expect(() => readBackupBytes(new Uint8Array(0))).toThrow(/empty/)
  })

  it('stops inflating a zip bomb as soon as it passes the limit', () => {
    // 20 MB of zeros deflates to about 20 kB; the limit is 1 MB.
    const bomb = zipSync({ 'a.json': new Uint8Array(20 * 1024 * 1024) })
    expect(bomb.byteLength).toBeLessThan(100_000)
    expect(() => readBackupBytes(bomb, 1024 * 1024)).toThrow(/inside the zip is larger/)
  })

  it('does not need a declared size: a stream zip with no sizes is still capped', () => {
    const out: Uint8Array[] = []
    const zip = new Zip((err, chunk) => {
      if (err) throw err
      out.push(chunk)
    })
    const file = new ZipDeflate('a.json')
    zip.add(file)
    file.push(new Uint8Array(2 * 1024 * 1024), true)
    zip.end()
    expect(() => readBackupBytes(concat(out), 1024 * 1024)).toThrow(/inside the zip is larger/)
  })

  it('refuses a damaged zip and non-UTF-8 text', () => {
    const zip = zipSync({ 'a.json': strToU8(json) })
    expect(() => readBackupBytes(zip.slice(0, 60))).toThrow(BackupError)
    expect(() => readBackupBytes(new Uint8Array([0xff, 0xfe, 0x00]))).toThrow(/UTF-8/)
  })
})

describe('diffMappings', () => {
  it('lists added, changed and removed rows', () => {
    const m = (cat: string, federal: string) => ({
      stateId: 'LA',
      stateCategory: cat,
      stateSubcategory: '',
      federalCategory: federal as 'state_specific',
      method: 'manual' as const,
      confidence: null,
      mappedBy: 'a',
      mappedAt: 'x',
    })
    const lines = diffMappings(
      {
        categoryMappings: [m('A', 'state_specific'), m('B', 'state_specific')],
        chapterMappings: [],
        columnProfiles: [],
      },
      {
        categoryMappings: [m('A', 'unmapped'), m('C', 'state_specific')],
        chapterMappings: [],
        columnProfiles: [],
      },
    )
    expect(lines.map((l) => `${l.kind} ${l.what}`)).toEqual([
      'changed Category “A”',
      'added Category “C”',
      'removed Category “B”',
    ])
  })
})

describe('restoredFileType', () => {
  it('uses the backup’s type, else guesses from the URL or title', () => {
    expect(restoredFileType({ ...source, fileType: 'xlsx' })).toBe('xlsx')
    expect(restoredFileType({ ...source, url: 'https://x.gov/list.csv' })).toBe('csv')
    expect(restoredFileType(source)).toBe('pdf')
  })
})
