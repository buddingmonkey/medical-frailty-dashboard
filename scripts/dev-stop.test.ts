import { describe, expect, it } from 'vitest'

import { devRoots, parsePs, parseWin32Processes, processTree, repoRootOf } from './dev-stop'

const REPO = '/home/u/git/medical-frailty-dashboard'

// A real `ps -eo pid=,ppid=,args=` shape from a running `pnpm dev` (paths shortened).
const ps = `
    1     0 /sbin/init
  100     1 node /usr/bin/pnpm dev
  101   100 sh -c pnpm --filter @mfcd/web build && concurrently -k -n web,api -c blue,magenta "pnpm --filter @mfcd/web build --watch" "pnpm --filter @mfcd/api dev"
  200   101 node ${REPO}/node_modules/.bin/../.pnpm/concurrently@10.0.6/node_modules/concurrently/dist/bin/index.js -k -n web,api -c blue,magenta pnpm --filter @mfcd/web build --watch pnpm --filter @mfcd/api dev
  210   200 /bin/sh -c pnpm --filter @mfcd/web build --watch
  211   210 pnpm --filter @mfcd/web build --watch
  212   211 node ${REPO}/node_modules/vite/bin/vite.js build --watch
  220   200 /bin/sh -c pnpm --filter @mfcd/api dev
  221   220 node ${REPO}/node_modules/.pnpm/wrangler/bin/wrangler.js dev --port 8787 --var ENVIRONMENT:development
  222   221 ${REPO}/node_modules/@cloudflare/workerd-linux-64/bin/workerd serve --binary
  300     1 node /other/project/node_modules/.bin/vite build --watch
  301     1 node ${REPO}/node_modules/.pnpm/wrangler/bin/wrangler.js dev --port 8788 --var ENVIRONMENT:test
`

describe('parsePs', () => {
  it('reads pid, parent pid and the full command line', () => {
    const procs = parsePs(ps)
    expect(procs).toHaveLength(12)
    expect(procs[1]).toEqual({ pid: 100, ppid: 1, args: 'node /usr/bin/pnpm dev' })
  })
})

describe('devRoots', () => {
  it('finds the concurrently process that pnpm dev starts (and its wrangler; the tree dedupes)', () => {
    expect(devRoots(parsePs(ps), REPO).map((p) => p.pid)).toEqual([200, 221])
  })

  it('finds a lone wrangler dev on port 8787 from this repo, but not the e2e server on 8788', () => {
    const lone = parsePs(`
  221     1 node ${REPO}/node_modules/.pnpm/wrangler/bin/wrangler.js dev --port 8787
  222   221 ${REPO}/node_modules/@cloudflare/workerd-linux-64/bin/workerd serve
  301     1 node ${REPO}/node_modules/.pnpm/wrangler/bin/wrangler.js dev --port 8788
  400     1 node /other/node_modules/wrangler/bin/wrangler.js dev --port 8787
`)
    expect(devRoots(lone, REPO).map((p) => p.pid)).toEqual([221])
  })

  it('does not count the sh -c wrapper that only mentions concurrently', () => {
    expect(devRoots(parsePs(ps), REPO).some((p) => p.pid === 101)).toBe(false)
  })
})

describe('processTree', () => {
  it('lists the roots and every descendant, parents before children', () => {
    const procs = parsePs(ps)
    const order = processTree(procs, devRoots(procs, REPO))
    expect([...order].sort((a, b) => a - b)).toEqual([200, 210, 211, 212, 220, 221, 222])
    expect(order.indexOf(221)).toBeLessThan(order.indexOf(222))
    expect(order.indexOf(200)).toBe(0)
  })

  it('leaves out the stopping process itself', () => {
    const procs = parsePs(ps)
    expect(processTree(procs, devRoots(procs, REPO), 212)).not.toContain(212)
  })
})

describe('parsePs with Windows line endings', () => {
  it('drops the carriage return', () => {
    expect(parsePs('  100     1 node a.js\r\n  101   100 node b.js\r\n')).toEqual([
      { pid: 100, ppid: 1, args: 'node a.js' },
      { pid: 101, ppid: 100, args: 'node b.js' },
    ])
  })
})

// The shape `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine
// | ConvertTo-Json` prints for a running `pnpm dev` (paths shortened).
const WIN_REPO = String.raw`C:\Users\u\git\medical-frailty-dashboard`
const NODE = String.raw`"C:\Program Files\nodejs\node.exe"`
const winJson = JSON.stringify([
  { ProcessId: 4, ParentProcessId: 0, CommandLine: null },
  { ProcessId: 100, ParentProcessId: 50, CommandLine: 'pnpm.exe dev' },
  {
    ProcessId: 101,
    ParentProcessId: 100,
    CommandLine: String.raw`C:\WINDOWS\system32\cmd.exe /d /s /c "pnpm --filter @mfcd/web build && concurrently -k -n web,api "pnpm --filter @mfcd/web build --watch" "pnpm --filter @mfcd/api dev""`,
  },
  {
    ProcessId: 200,
    ParentProcessId: 101,
    // Drive letter in lower case, as a .cmd shim can pass it.
    CommandLine: String.raw`${NODE} "c:\Users\u\git\medical-frailty-dashboard\node_modules\.bin\..\.pnpm\concurrently@10.0.6\node_modules\concurrently\dist\bin\index.js" -k -n web,api "pnpm --filter @mfcd/web build --watch" "pnpm --filter @mfcd/api dev"`,
  },
  {
    ProcessId: 220,
    ParentProcessId: 200,
    CommandLine: 'cmd.exe /d /s /c pnpm --filter @mfcd/api dev',
  },
  {
    ProcessId: 221,
    ParentProcessId: 220,
    CommandLine: String.raw`${NODE} "${WIN_REPO}\apps\api\node_modules\wrangler\bin\wrangler.js" dev --port 8787 --var ENVIRONMENT:development`,
  },
  {
    ProcessId: 222,
    ParentProcessId: 221,
    CommandLine: String.raw`${WIN_REPO}\node_modules\@cloudflare\workerd-windows-64\bin\workerd.exe serve`,
  },
  {
    ProcessId: 301,
    ParentProcessId: 1,
    CommandLine: `node ${WIN_REPO}/node_modules/wrangler/bin/wrangler.js dev --port 8788`,
  },
  {
    ProcessId: 400,
    ParentProcessId: 1,
    CommandLine: String.raw`node C:\Users\u\git\other\node_modules\concurrently\dist\bin\index.js "pnpm --filter @mfcd/api dev"`,
  },
])

describe('parseWin32Processes', () => {
  it('reads process id, parent id and command line, with an empty line for system processes', () => {
    const procs = parseWin32Processes(winJson)
    expect(procs).toHaveLength(9)
    expect(procs[0]).toEqual({ pid: 4, ppid: 0, args: '' })
    expect(procs[1]).toEqual({ pid: 100, ppid: 50, args: 'pnpm.exe dev' })
  })

  it('reads the single object ConvertTo-Json prints for one process', () => {
    expect(
      parseWin32Processes('{"ProcessId":7,"ParentProcessId":1,"CommandLine":"node x.js"}\r\n'),
    ).toEqual([{ pid: 7, ppid: 1, args: 'node x.js' }])
  })

  it('reads nothing from empty output', () => {
    expect(parseWin32Processes('')).toEqual([])
  })
})

describe('devRoots on Windows', () => {
  it('matches backslash paths and any drive-letter case, never the e2e server or other projects', () => {
    const procs = parseWin32Processes(winJson)
    expect(devRoots(procs, WIN_REPO, 'win32').map((p) => p.pid)).toEqual([200, 221])
  })

  it('matches a root written with forward slashes or a trailing separator', () => {
    const procs = parseWin32Processes(winJson)
    const root = 'c:/users/u/git/medical-frailty-dashboard/'
    expect(devRoots(procs, root, 'win32').map((p) => p.pid)).toEqual([200, 221])
  })

  it('does not match a sibling folder whose name starts with the repo name', () => {
    const procs = parseWin32Processes(
      JSON.stringify([
        {
          ProcessId: 9,
          ParentProcessId: 1,
          CommandLine: String.raw`node ${WIN_REPO}-old\node_modules\wrangler\bin\wrangler.js dev --port 8787`,
        },
      ]),
    )
    expect(devRoots(procs, WIN_REPO, 'win32')).toEqual([])
  })

  it('stays case-sensitive on Linux', () => {
    expect(devRoots(parsePs(ps), REPO.toUpperCase(), 'linux')).toEqual([])
  })

  it('lists the whole tree from the roots, parents first', () => {
    const procs = parseWin32Processes(winJson)
    expect(processTree(procs, devRoots(procs, WIN_REPO, 'win32'))).toEqual([200, 221, 220, 222])
  })
})

describe('repoRootOf', () => {
  it('turns the script URL into the repo path, without a trailing separator', () => {
    expect(repoRootOf('file:///home/u/repo/scripts/dev-stop.ts', 'linux')).toBe('/home/u/repo')
    expect(repoRootOf('file:///C:/Users/u/repo/scripts/dev-stop.ts', 'win32')).toBe(
      String.raw`C:\Users\u\repo`,
    )
  })
})
