import { describe, expect, it } from 'vitest'

import { maintenanceRunSchema, publishBackupKey, weeklyDumpDate } from './maintenance'

describe('weeklyDumpDate', () => {
  it.each([
    ['backups/weekly/2026-11-01.zip', '2026-11-01'],
    ['backups/weekly/2026-02-30.zip', null],
    ['backups/weekly/2026-11-01.json', null],
    ['backups/weekly/../2026-11-01.zip', null],
    ['backups/MT/12.json', null],
  ])('%s → %s', (key, date) => {
    expect(weeklyDumpDate(key)).toBe(date)
  })
})

describe('publishBackupKey', () => {
  it('reads the state and version id', () => {
    expect(publishBackupKey('backups/MT/12.json')).toEqual({ stateId: 'MT', versionId: 12 })
    expect(publishBackupKey('backups/weekly/2026-11-01.zip')).toBeNull()
    expect(publishBackupKey('backups/mt/12.json')).toBeNull()
    expect(publishBackupKey('sources/MT/12.json')).toBeNull()
  })
})

describe('maintenanceRunSchema', () => {
  it('refuses a part with row data in place of counts', () => {
    const part = { status: 'ok', ms: 1, counts: {}, error: null }
    const bad = { ...part, counts: { code: 'F20.0' } }
    const run = (draftCleanup: unknown) => ({
      startedAt: '2026-11-01T07:00:00.000Z',
      finishedAt: '2026-11-01T07:00:01.000Z',
      trigger: 'cron',
      parts: { weeklyDump: part, pruneWeeklyDumps: part, prunePublishBackups: part, draftCleanup },
    })
    expect(maintenanceRunSchema.safeParse(run(bad)).success).toBe(false)
    expect(maintenanceRunSchema.safeParse(run(part)).success).toBe(true)
  })
})
