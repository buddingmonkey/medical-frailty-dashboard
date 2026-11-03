import { describe, expect, it } from 'vitest'

import { type Host, nodeCommand, pnpmCommand } from './run'

const linux: Host = {
  platform: 'linux',
  env: { npm_execpath: '/usr/lib/node_modules/pnpm/pnpm' },
  execPath: '/usr/bin/node',
  exists: () => false,
}

const win = (
  npmExecpath: string | undefined,
  exists: (p: string) => boolean = () => false,
): Host => ({
  platform: 'win32',
  env: npmExecpath === undefined ? {} : { npm_execpath: npmExecpath },
  execPath: 'C:\\Program Files\\nodejs\\node.exe',
  exists,
})

const SQL = `SELECT * FROM t WHERE a = '%PATH%' AND b = "x" & echo hi | more`

describe('pnpmCommand', () => {
  it('runs pnpm from PATH without a shell on Linux and macOS, whatever npm_execpath says', () => {
    expect(pnpmCommand(['exec', 'wrangler', '--command', SQL], linux)).toEqual({
      command: 'pnpm',
      args: ['exec', 'wrangler', '--command', SQL],
      shell: false,
    })
    expect(pnpmCommand(['check'], { ...linux, platform: 'darwin', env: {} })).toEqual({
      command: 'pnpm',
      args: ['check'],
      shell: false,
    })
  })

  it('on Windows, runs the pnpm executable that started this script, without a shell', () => {
    const exe = 'C:\\Users\\u\\AppData\\Local\\pnpm\\pnpm.exe'
    expect(pnpmCommand(['exec', 'wrangler', '--command', SQL], win(exe))).toEqual({
      command: exe,
      args: ['exec', 'wrangler', '--command', SQL],
      shell: false,
    })
  })

  it('on Windows, adds .exe to an npm_execpath without an extension when that file exists', () => {
    const bare = 'C:\\nodejs\\node_modules\\pnpm\\pnpm'
    expect(
      pnpmCommand(
        ['check'],
        win(bare, (p) => p === `${bare}.exe`),
      ),
    ).toEqual({
      command: `${bare}.exe`,
      args: ['check'],
      shell: false,
    })
  })

  it('on Windows, runs a JavaScript pnpm entry with this Node, without a shell', () => {
    const cjs = 'C:\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs'
    expect(pnpmCommand(['exec', 'vitest'], win(cjs))).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [cjs, 'exec', 'vitest'],
      shell: false,
    })
  })

  it('never runs npm when the script was started by npm run', () => {
    const npm = 'C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
    expect(pnpmCommand(['install'], win(npm))).toEqual({
      command: 'pnpm install',
      args: [],
      shell: true,
    })
  })

  it('on Windows without a usable npm_execpath, uses the shell only for plain arguments', () => {
    expect(pnpmCommand(['install', '--frozen-lockfile', '--silent'], win(undefined))).toEqual({
      command: 'pnpm install --frozen-lockfile --silent',
      args: [],
      shell: true,
    })
    expect(
      pnpmCommand(['--filter', '@mfcd/api', 'exec', 'C:\\x/y.ts'], win('pnpm.cmd')).shell,
    ).toBe(true)
  })

  it('refuses to hand cmd.exe an argument it could misread', () => {
    for (const arg of [SQL, 'a b', '', '%PATH%', 'a&b', 'a|b', 'a>b', 'a"b', '^', '!x!', 'a\nb']) {
      expect(() => pnpmCommand(['exec', 'wrangler', arg], win(undefined)), arg).toThrow(
        /through pnpm/,
      )
    }
  })
})

describe('nodeCommand', () => {
  it('runs the Node that runs this script', () => {
    expect(nodeCommand(['scripts/cf.ts', 'whoami'], linux)).toEqual({
      command: '/usr/bin/node',
      args: ['scripts/cf.ts', 'whoami'],
      shell: false,
    })
  })
})
