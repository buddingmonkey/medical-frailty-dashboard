// `pnpm dev:stop`: stops what `pnpm dev` started (concurrently, the web build watcher, wrangler
// and its workerd children), and nothing else. Parents are signalled before children, because
// wrangler restarts workerd if only the child dies. Runs directly on Node 26 (type stripping).
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
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line)
    if (match)
      procs.push({ pid: Number(match[1]), ppid: Number(match[2]), args: (match[3] ?? '').trim() })
  }
  return procs
}

/**
 * The top of a `pnpm dev` tree: this repo's concurrently running the api dev script, or a lone
 * `wrangler dev` on the dev port started from this repo. The e2e server (another port) and
 * other projects are never matched.
 */
export function devRoots(procs: readonly Proc[], repoRoot: string): Proc[] {
  return procs.filter((p) => {
    if (!p.args.includes(repoRoot)) return false
    const concurrently = p.args.includes('/concurrently/') && p.args.includes('@mfcd/api dev')
    const wrangler =
      p.args.includes('wrangler') && p.args.includes(` dev --port ${String(DEV_PORT)}`)
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

function signal(pids: readonly number[], sig: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, sig)
    } catch {
      // Already gone.
    }
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

async function main(): Promise<void> {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
  const procs = parsePs(execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }))
  const pids = processTree(procs, devRoots(procs, repoRoot))
  if (pids.length === 0) {
    console.log('pnpm dev is not running.')
  } else {
    signal(pids, 'SIGTERM')
    for (let i = 0; i < 25 && pids.some(alive); i++) await new Promise((r) => setTimeout(r, 200))
    const stubborn = pids.filter(alive)
    signal(stubborn, 'SIGKILL')
    console.log(
      `Stopped ${String(pids.length)} processes` +
        (stubborn.length > 0 ? ` (${String(stubborn.length)} needed SIGKILL).` : '.'),
    )
  }
  if (!(await portIsFree(DEV_PORT))) {
    console.error(
      `Port ${String(DEV_PORT)} is still in use by something else: ss -ltnp | grep ${String(DEV_PORT)}`,
    )
    process.exitCode = 1
  }
}

if (import.meta.main) await main()
