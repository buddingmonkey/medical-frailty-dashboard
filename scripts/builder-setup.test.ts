import { describe, expect, it } from 'vitest'

import { LOCAL_FILES, mainWorktreeOf, samePath } from './builder-setup'

describe('mainWorktreeOf', () => {
  it('reads the first worktree from `git worktree list --porcelain`', () => {
    const out = [
      'worktree /home/u/repo',
      'HEAD 091aa17',
      'branch refs/heads/main',
      '',
      'worktree /home/u/repo/.claude/worktrees/agent-1',
      'HEAD 091aa17',
      'branch refs/heads/worktree-agent-1',
      '',
    ].join('\n')
    expect(mainWorktreeOf(out)).toBe('/home/u/repo')
  })

  it('reads Windows output: forward slashes, CRLF line endings', () => {
    expect(mainWorktreeOf('worktree C:/Users/u/repo\r\nHEAD 091aa17\r\n')).toBe('C:/Users/u/repo')
  })

  it('is undefined for empty output', () => {
    expect(mainWorktreeOf('')).toBeUndefined()
  })
})

describe('samePath', () => {
  it('compares Windows paths across separators and letter case', () => {
    expect(samePath('C:/Users/u/repo', 'c:\\Users\\U\\repo\\', 'win32')).toBe(true)
    expect(samePath('C:/Users/u/repo', String.raw`C:\Users\u\repo\.claude\x`, 'win32')).toBe(false)
  })

  it('compares Linux paths exactly, ignoring a trailing slash', () => {
    expect(samePath('/home/u/repo', '/home/u/repo/', 'linux')).toBe(true)
    expect(samePath('/home/u/repo', '/home/u/Repo', 'linux')).toBe(false)
  })
})

describe('LOCAL_FILES', () => {
  it('lists only the gitignored secret files, as repo-relative paths', () => {
    expect(LOCAL_FILES).toEqual(['apps/api/.dev.vars', 'apps/api/.env.cloudflare'])
  })
})
