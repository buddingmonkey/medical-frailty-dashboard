// Runs `pnpm` and `node` from the repo's scripts on Windows, macOS and Linux, never through a
// shell when the arguments could hold text a shell would read (SQL, paths with spaces).
//
// - node: `process.execPath`, the Node running this script, so nothing depends on PATH.
// - pnpm on Linux and macOS: `pnpm` from PATH, no shell (as before).
// - pnpm on Windows: `pnpm` is often `pnpm.cmd`, and Node (>= 20.12) runs a .cmd only through
//   cmd.exe, whose quoting cannot hold every string safely (`%VAR%` expands even inside quotes).
//   So this runs the pnpm that started the script instead: pnpm sets `npm_execpath` to its own
//   executable (pnpm.exe) or JavaScript entry (pnpm.cjs, run with this Node). Only when that is
//   missing, as when a script is started with plain `node`, does it fall back to cmd.exe, and
//   only for arguments made of characters cmd.exe never treats specially.
import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process'
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'

export interface Command {
  command: string
  args: string[]
  shell: boolean
}

/** What the command depends on, so tests can describe another platform. */
export interface Host {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  execPath: string
  exists: (path: string) => boolean
}

const currentHost = (): Host => ({
  platform: process.platform,
  env: process.env,
  execPath: process.execPath,
  exists: existsSync,
})

/** Characters cmd.exe passes through unchanged, unquoted. */
const PLAIN_ARG = /^[\w@./\\:=,+-]+$/

/** The pnpm executable or script named by `npm_execpath`, if it is pnpm's (Windows paths). */
function pnpmFromExecpath(host: Host, args: readonly string[]): Command | undefined {
  const path = host.env['npm_execpath']
  if (!path) return undefined
  const ext = win32.extname(path).toLowerCase()
  if (!/^pnpm$/i.test(win32.basename(path, win32.extname(path)))) return undefined
  if (['.js', '.cjs', '.mjs'].includes(ext)) {
    return { command: host.execPath, args: [path, ...args], shell: false }
  }
  if (ext === '.exe') return { command: path, args: [...args], shell: false }
  if (ext === '' && host.exists(`${path}.exe`)) {
    return { command: `${path}.exe`, args: [...args], shell: false }
  }
  return undefined // pnpm.cmd, pnpm.ps1: these need a shell.
}

/** How to run `pnpm <args>` on this platform. */
export function pnpmCommand(args: readonly string[], host: Host = currentHost()): Command {
  if (host.platform !== 'win32') return { command: 'pnpm', args: [...args], shell: false }
  const direct = pnpmFromExecpath(host, args)
  if (direct) return direct
  const unsafe = args.find((a) => !PLAIN_ARG.test(a))
  if (unsafe !== undefined) {
    throw new Error(
      `Cannot pass ${JSON.stringify(unsafe)} to pnpm safely through cmd.exe. Run this script ` +
        'through pnpm (for example `pnpm check`), not with plain `node`.',
    )
  }
  // One string, so Node does not join (and warn about) separate arguments for the shell.
  return { command: ['pnpm', ...args].join(' '), args: [], shell: true }
}

/** How to run `node <args>`: the same Node as this script. */
export function nodeCommand(args: readonly string[], host: Host = currentHost()): Command {
  return { command: host.execPath, args: [...args], shell: false }
}

function run(c: Command, options: SpawnSyncOptions): SpawnSyncReturns<string | Buffer> {
  return spawnSync(c.command, c.args, { ...options, shell: c.shell })
}

/** `spawnSync('pnpm', args, options)`, on every platform. */
export function runPnpm(
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string>
export function runPnpm(
  args: readonly string[],
  options?: SpawnSyncOptions,
): SpawnSyncReturns<string | Buffer>
export function runPnpm(
  args: readonly string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
  return run(pnpmCommand(args), options)
}

/** `spawnSync('node', args, options)`, on every platform. */
export function runNode(
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string>
export function runNode(
  args: readonly string[],
  options?: SpawnSyncOptions,
): SpawnSyncReturns<string | Buffer>
export function runNode(
  args: readonly string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
  return run(nodeCommand(args), options)
}
