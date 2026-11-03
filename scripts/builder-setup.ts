// `node scripts/builder-setup.ts`: sets up a builder's worktree (.claude/agents/builder.md):
// checks it is clean, brings it up to date with main, installs packages (pnpm links from the
// shared store, so this is quick) and links the gitignored local files a builder may need from
// the main checkout. Prints one line: branch, HEAD and main short SHAs. Idempotent. Exit 1 on
// failure. Runs directly on Node 26 (type stripping) on Windows, macOS and Linux.
//
// Local secrets stay in the main checkout and are linked, not copied (the repo is public).
// Windows allows symbolic links only with Developer Mode or as administrator; without them this
// copies the file instead, only when git ignores the destination, and says so.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { runPnpm } from './lib/run.ts'

/** The gitignored files a builder may need, relative to the repo root. */
export const LOCAL_FILES = ['apps/api/.dev.vars', 'apps/api/.env.cloudflare'] as const

/** The main checkout: the first `worktree` line of `git worktree list --porcelain`. */
export function mainWorktreeOf(porcelain: string): string | undefined {
  const first = porcelain.split(/\r?\n/)[0] ?? ''
  return first.startsWith('worktree ') ? first.slice('worktree '.length).trim() : undefined
}

/** True when `a` and `b` name the same folder (Windows: any separator, any letter case). */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform) {
  const norm = (p: string) => {
    const slashes = platform === 'win32' ? p.replace(/\\/g, '/').toLowerCase() : p
    return slashes.replace(/\/+$/, '')
  }
  return norm(a) === norm(b)
}

class SetupError extends Error {}

function fail(message: string): never {
  throw new SetupError(message)
}

function main(): void {
  const root = resolve(import.meta.dirname, '..')
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const tryGit = (args: string[], message: string): string => {
    try {
      return git(args)
    } catch {
      return fail(message)
    }
  }

  const mainCheckout = mainWorktreeOf(
    tryGit(['worktree', 'list', '--porcelain'], 'git worktree failed'),
  )
  if (!mainCheckout) fail('cannot find the main checkout')
  if (samePath(resolve(mainCheckout), root))
    fail('run this in a builder worktree, not the main checkout')
  if (tryGit(['status', '--porcelain', '--untracked-files=no'], 'git status failed').trim()) {
    fail('worktree has uncommitted changes')
  }
  tryGit(['fetch', '-q', 'origin', 'main'], 'fetch failed')
  const ahead = tryGit(['rev-list', '--count', 'origin/main..HEAD'], 'rev-list failed').trim()
  if (ahead === '0') tryGit(['reset', '--hard', '-q', 'origin/main'], 'reset to main failed')
  else tryGit(['merge', '-q', '--no-edit', 'origin/main'], 'merge main failed')

  const install = runPnpm(['install', '--frozen-lockfile', '--silent'], {
    cwd: root,
    stdio: 'ignore',
  })
  if (install.status !== 0) fail('pnpm install failed')

  const copied: string[] = []
  for (const file of LOCAL_FILES) {
    const source = join(mainCheckout, file)
    const dest = join(root, file)
    // lstat, so a dangling link counts as present (as `ln -s` would refuse it).
    const present = (() => {
      try {
        lstatSync(dest)
        return true
      } catch {
        return false
      }
    })()
    if (!existsSync(source) || present) continue
    try {
      git(['check-ignore', '-q', '--', file])
    } catch {
      fail(`${file} is not gitignored; refusing to put a secret file there`)
    }
    try {
      symlinkSync(source, dest, 'file')
    } catch {
      copyFileSync(source, dest)
      copied.push(file)
    }
  }

  const sha = (ref: string) => git(['rev-parse', '--short', ref]).trim()
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  console.log(`${branch} ${sha('HEAD')} main ${sha('origin/main')}`)
  if (copied.length > 0) {
    console.log(
      `builder-setup: copied (could not link) ${copied.join(', ')}: gitignored secrets; ` +
        'they do not follow changes in the main checkout. Delete them with the worktree.',
    )
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(`builder-setup: ${error instanceof SetupError ? error.message : String(error)}`)
    process.exit(1)
  }
}
