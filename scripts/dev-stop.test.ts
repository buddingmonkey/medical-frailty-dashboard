import { describe, expect, it } from 'vitest'

import { devRoots, parsePs, processTree } from './dev-stop'

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
