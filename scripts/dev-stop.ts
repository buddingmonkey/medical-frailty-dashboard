// `pnpm dev:stop`: stops what `pnpm dev` started (concurrently, the web build watcher, wrangler
// and its workerd children), and nothing else. Parents are stopped before children, because
// wrangler restarts workerd if only the child dies. Runs directly on Node 26 (type stripping).
//
// Linux and macOS: reads `ps`, sends SIGTERM, then SIGKILL to what is left.
// Windows: reads Win32_Process through PowerShell and ends the processes with
// `taskkill /F /T`, parents first. Windows has no SIGTERM: Node and taskkill both end a process
// at once, so wrangler has no time to restart workerd once wrangler is gone.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

export interface Proc {
  pid: number
  ppid: number
  args: string
}

const DEV_PORT = 8787

/** Parses `ps -eo pid=,ppid=,args=` output. */
export function parsePs(output: string): Proc[] {
  const procs: Proc[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line)
    if (match)
      procs.push({ pid: Number(match[1]), ppid: Number(match[2]), args: (match[3] ?? '').trim() })
  }
  return procs
}

interface Win32Process {
  ProcessId?: unknown
  ParentProcessId?: unknown
  CommandLine?: unknown
}

/**
 * Parses `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine |
 * ConvertTo-Json` output: an array, or one object for a single process. System processes have
 * no command line.
 */
export function parseWin32Processes(output: string): Proc[] {
  const text = output.trim()
  if (text === '') return []
  const parsed = JSON.parse(text) as Win32Process | Win32Process[]
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap((row) =>
    typeof row.ProcessId === 'number' && typeof row.ParentProcessId === 'number'
      ? [
          {
            pid: row.ProcessId,
            ppid: row.ParentProcessId,
            args: typeof row.CommandLine === 'string' ? row.CommandLine.trim() : '',
          },
        ]
      : [],
  )
}

/** Windows paths: one separator and one letter case, so `C:\A` and `c:/a` compare equal. */
const forMatching = (text: string, platform: NodeJS.Platform): string =>
  platform === 'win32' ? text.replace(/\\/g, '/').toLowerCase() : text

/** The repo folder (this script's parent's parent), without a trailing separator. */
export function repoRootOf(
  scriptUrl: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return fileURLToPath(new URL('..', scriptUrl), { windows: platform === 'win32' }).replace(
    /[\\/]$/,
    '',
  )
}

/**
 * The top of a `pnpm dev` tree: this repo's concurrently running the api dev script, or a lone
 * `wrangler dev` on the dev port started from this repo. The e2e server (another port) and
 * other projects are never matched.
 */
export function devRoots(
  procs: readonly Proc[],
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
): Proc[] {
  const root = `${forMatching(repoRoot, platform).replace(/\/$/, '')}/`
  return procs.filter((p) => {
    const args = forMatching(p.args, platform)
    if (!args.includes(root)) return false
    const concurrently = args.includes('/concurrently/') && args.includes('@mfcd/api dev')
    const wrangler = args.includes('wrangler') && args.includes(` dev --port ${String(DEV_PORT)}`)
    return concurrently || wrangler
  })
}

/** The roots and all their descendants, parents before children, without `selfPid`. */
export function processTree(
  procs: readonly Proc[],
  roots: readonly Proc[],
  selfPid = process.pid,
): number[] {
  const order: number[] = []
  const seen = new Set<number>()
  const queue = roots.map((r) => r.pid)
  while (queue.length > 0) {
    const pid = queue.shift()
    if (pid === undefined || seen.has(pid)) continue
    seen.add(pid)
    if (pid !== selfPid) order.push(pid)
    for (const child of procs) if (child.ppid === pid) queue.push(child.pid)
  }
  return order
}

const WIN32_PROCESSES =
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ' +
  'ConvertTo-Json -Compress'

function listProcesses(): Proc[] {
  if (process.platform === 'win32') {
    const json = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WIN32_PROCESSES],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    )
    return parseWin32Processes(json)
  }
  return parsePs(execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }))
}

function signal(pids: readonly number[], sig: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, sig)
    } catch {
      // Already gone.
    }
  }
}

/** Ends the processes at once, in the order given (parents first); /T also takes any child. */
function taskkill(pids: readonly number[]): void {
  if (pids.length === 0) return
  try {
    execFileSync('taskkill', ['/F', '/T', ...pids.flatMap((pid) => ['/PID', String(pid)])], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch {
    // Non-zero when some were already gone (a child ended with its parent).
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const portIsFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => {
      resolve(false)
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve(true)
      })
    })
  })

const waitForExit = async (pids: readonly number[]): Promise<void> => {
  for (let i = 0; i < 25 && pids.some(alive); i++) await new Promise((r) => setTimeout(r, 200))
}

async function main(): Promise<void> {
  const windows = process.platform === 'win32'
  const procs = listProcesses()
  const pids = processTree(procs, devRoots(procs, repoRootOf(import.meta.url)))
  if (pids.length === 0) {
    console.log('pnpm dev is not running.')
  } else if (windows) {
    taskkill(pids)
    await waitForExit(pids)
    const left = pids.filter(alive)
    console.log(
      `Stopped ${String(pids.length - left.length)} processes` +
        (left.length > 0 ? ` (${String(left.length)} still running: ${left.join(', ')}).` : '.'),
    )
    if (left.length > 0) process.exitCode = 1
  } else {
    signal(pids, 'SIGTERM')
    await waitForExit(pids)
    const stubborn = pids.filter(alive)
    signal(stubborn, 'SIGKILL')
    console.log(
      `Stopped ${String(pids.length)} processes` +
        (stubborn.length > 0 ? ` (${String(stubborn.length)} needed SIGKILL).` : '.'),
    )
  }
  if (!(await portIsFree(DEV_PORT))) {
    const port = String(DEV_PORT)
    const find = windows ? `netstat -ano | findstr :${port}` : `ss -ltnp | grep ${port}`
    console.error(`Port ${port} is still in use by something else: ${find}`)
    process.exitCode = 1
  }
}

if (import.meta.main) await main()
