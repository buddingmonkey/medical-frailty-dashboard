// `pnpm check` / `pnpm check:full`: run every check, print one line per stage, keep full logs
// in .logs/latest/<stage>.log. Runs directly on Node 26 (type stripping), no build step.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Stage {
  name: string
  args: string[]
  /** Pulls a short result (e.g. "6 passed") out of the log. */
  summarize?: (log: string) => string
}

const vitestSummary = (log: string): string => /Tests\s+(.+?)\s*\(\d+\)/.exec(log)?.[1] ?? ''
const playwrightSummary = (log: string): string =>
  [...log.matchAll(/^\s*(\d+ (?:passed|failed|flaky|skipped))/gm)].map((m) => m[1]).join(', ')

const vitest = (project: string): Stage => ({
  name: project,
  args: ['exec', 'vitest', 'run', '--project', project],
  summarize: vitestSummary,
})

const stages: Stage[] = [
  { name: 'format', args: ['format:check'] },
  { name: 'lint', args: ['lint'] },
  { name: 'types', args: ['typecheck'] },
  // Schema changes without a migration (scripts/db-drift.ts).
  { name: 'db-drift', args: ['db:drift'] },
  vitest('unit'),
  vitest('refdata'),
  vitest('component'),
  vitest('api'),
  vitest('scripts'),
]

if (process.argv.includes('--full')) {
  stages.push(
    { name: 'build', args: ['build'] },
    // The build stage above produced apps/web/dist, so run Playwright directly.
    { name: 'e2e', args: ['--filter', '@mfcd/web', 'e2e'], summarize: playwrightSummary },
  )
}

const logDir = join('.logs', 'latest')
rmSync(logDir, { recursive: true, force: true })
mkdirSync(logDir, { recursive: true })

const width = Math.max(...stages.map((s) => s.name.length))
let failed = 0

for (const stage of stages) {
  const started = performance.now()
  const result = spawnSync('pnpm', stage.args, {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: process.env['CI'] ?? '' },
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const logFile = join(logDir, `${stage.name}.log`)
  const log = `${result.stdout}${result.stderr}${result.error ? String(result.error) : ''}`
  writeFileSync(logFile, log)

  const ok = result.status === 0
  if (!ok) failed++
  const detail = stage.summarize?.(readFileSync(logFile, 'utf8')) ?? ''
  const label = stage.name.padEnd(width)
  const note = ok ? detail : `${detail ? `${detail}, ` : ''}see ${logFile}`
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  ${seconds}s${note ? `  ${note}` : ''}`)
}

console.log(failed ? `${String(failed)} stage(s) failed` : 'all checks passed')
process.exitCode = failed ? 1 : 0
