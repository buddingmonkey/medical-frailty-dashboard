import { describe, expect, it } from 'vitest'

import { seedCommand } from './seed'

describe('seedCommand', () => {
  it('loads into the local D1 or the preview D1', () => {
    expect(seedCommand(['--env', 'local'], '/s.sql')).toEqual([
      'd1',
      'execute',
      'DB',
      '--local',
      '--file',
      '/s.sql',
    ])
    expect(seedCommand(['--env', 'preview'], '/s.sql')).toEqual([
      'd1',
      'execute',
      'frailty-preview',
      '--env',
      'preview',
      '--remote',
      '--file',
      '/s.sql',
    ])
  })

  it('passes --persist-to through for a local copy', () => {
    expect(seedCommand(['--env', 'local', '--persist-to', '/tmp/x'], '/s.sql')).toContain('/tmp/x')
  })

  it('refuses production, however it is asked for, and anything else', () => {
    for (const argv of [
      ['--env', 'production'],
      ['--env=production'],
      ['--env', 'preview', '--env', 'production'],
      ['--remote'],
      [],
    ]) {
      expect(() => seedCommand(argv, '/s.sql'), argv.join(' ')).toThrow(/local or preview/)
    }
  })
})
