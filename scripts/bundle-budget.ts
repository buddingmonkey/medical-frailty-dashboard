// Bundle size budget (roadmap M8 step 3): `node scripts/bundle-budget.ts` reads the web build in
// apps/web/dist, prints each script and style sheet with its gzip and brotli size, and fails when
// a group is over its budget or admin-only code (pdf.js, the parser worker, the ingest screen)
// would load on every page. `pnpm check:full` runs it right after the build stage, so it always
// measures a fresh build; `pnpm check` does not build, so it cannot run there.
//
// Budgets are the sizes on 2026-11-03 plus about 10%. When a change grows a group on purpose,
// raise its number here in the same pull request and say why. Runs directly on Node 26.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export interface Sized {
  /** Path inside dist, e.g. `assets/index-gGmhciKj.js`. */
  file: string
  /** The file name without its content hash, e.g. `index.js`. */
  name: string
  raw: number
  gzip: number
  brotli: number
}

export interface Budget {
  /** `initial` (every file dist/index.html loads), or a chunk name without its hash. */
  group: string
  /** Bytes. */
  brotli: number
  gzip: number
}

/** Chunks only the admin screens use. None may be in the first load of a public page. */
export const ADMIN_ONLY = /^(pdf|pdf\.worker\.min|pdf-layout|worker|ingest)\.m?js$/

/** Any chunk without its own budget: the biggest one plus about 10%. */
export const OTHER_CHUNK_BROTLI = 7_000

export const BUDGETS: readonly Budget[] = [
  // Every page: the entry, Vue, the router, TanStack Query, the shared package and the CSS.
  { group: 'initial', brotli: 127_000, gzip: 145_000 },
  // The home page's own chunk: the US map shapes are most of it.
  { group: '(home).js', brotli: 35_000, gzip: 49_000 },
  // Admin only, loaded on demand. pdf.js counts both copies (the page's and the worker's).
  { group: 'ingest.js', brotli: 26_000, gzip: 30_000 },
  { group: 'pdf.js', brotli: 271_000, gzip: 323_000 },
  { group: 'pdf.worker.min.mjs', brotli: 355_000, gzip: 432_000 },
  { group: 'worker.js', brotli: 59_000, gzip: 68_000 },
]

/** `assets/runtime-core.esm-bundler-GIwZZenQ.js` → `runtime-core.esm-bundler.js`. */
export function chunkName(file: string): string {
  const base = file.split('/').at(-1) ?? file
  return base.replace(/-[\w-]{8}(\.m?js|\.css)$/, '$1')
}

/** The scripts and style sheets dist/index.html loads on every page, in order. */
export function initialFiles(indexHtml: string): string[] {
  const out: string[] = []
  for (const m of indexHtml.matchAll(/<(script|link)\b[^>]*>/g)) {
    const tag = m[0]
    const url = /\b(?:src|href)="\/(assets\/[^"]+\.(?:m?js|css))"/.exec(tag)?.[1]
    if (!url) continue
    if (m[1] === 'link' && !/\brel="(modulepreload|stylesheet)"/.test(tag)) continue
    out.push(url)
  }
  return out
}

export function measure(file: string, content: Buffer): Sized {
  return {
    file,
    name: chunkName(file),
    raw: content.length,
    gzip: gzipSync(content, { level: 9 }).length,
    brotli: brotliCompressSync(content, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
}

const over = (label: string, kind: 'brotli' | 'gzip', size: number, limit: number, note = '') =>
  `${label}: ${kind} ${String(size)} B is over its budget of ${String(limit)} B${note}`

export function checkBudgets(
  files: readonly Sized[],
  initial: readonly string[],
  budgets: readonly Budget[],
): { failures: string[]; initialTotal: { gzip: number; brotli: number } } {
  const failures: string[] = []
  const initialSet = new Set(initial)
  const initialSized = files.filter((f) => initialSet.has(f.file))
  const initialTotal = {
    gzip: initialSized.reduce((n, f) => n + f.gzip, 0),
    brotli: initialSized.reduce((n, f) => n + f.brotli, 0),
  }

  for (const f of initialSized) {
    if (ADMIN_ONLY.test(f.name)) {
      failures.push(`${f.file} is admin-only code but every page loads it (dist/index.html)`)
    }
  }

  for (const b of budgets) {
    // A name can have more than one file: the parser worker bundles its own copy of pdf.js.
    const same = files.filter((f) => f.name === b.group && !initialSet.has(f.file))
    const size =
      b.group === 'initial'
        ? initialTotal
        : same.length > 0
          ? {
              gzip: same.reduce((n, f) => n + f.gzip, 0),
              brotli: same.reduce((n, f) => n + f.brotli, 0),
            }
          : null
    if (!size) {
      failures.push(`${b.group}: no file in the build; update BUDGETS in scripts/bundle-budget.ts`)
      continue
    }
    if (size.brotli > b.brotli) failures.push(over(b.group, 'brotli', size.brotli, b.brotli))
    if (size.gzip > b.gzip) failures.push(over(b.group, 'gzip', size.gzip, b.gzip))
  }

  const named = new Set(budgets.map((b) => b.group))
  for (const f of files) {
    if (initialSet.has(f.file) || named.has(f.name) || f.file.endsWith('.css')) continue
    if (f.brotli > OTHER_CHUNK_BROTLI) {
      failures.push(over(f.name, 'brotli', f.brotli, OTHER_CHUNK_BROTLI, ' (any other chunk)'))
    }
  }
  return { failures, initialTotal }
}

function main() {
  const dist = join(import.meta.dirname, '..', 'apps', 'web', 'dist')
  const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8')
  const assets = join(dist, 'assets')
  const files = readdirSync(assets)
    .filter((f) => /\.(m?js|css)$/.test(f))
    .map((f) => measure(relative(dist, join(assets, f)), readFileSync(join(assets, f))))
    .sort((a, b) => b.brotli - a.brotli)
  const initial = initialFiles(indexHtml)
  const { failures, initialTotal } = checkBudgets(files, initial, BUDGETS)

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KiB`.padStart(10)
  console.log(
    `${'file'.padEnd(34)}${'raw'.padStart(10)}${'gzip'.padStart(10)}${'brotli'.padStart(10)}`,
  )
  for (const f of files) {
    const mark = initial.includes(f.file) ? '*' : ' '
    console.log(`${mark}${f.name.padEnd(33)}${kb(f.raw)}${kb(f.gzip)}${kb(f.brotli)}`)
  }
  console.log(
    `initial load (*): gzip ${kb(initialTotal.gzip).trim()}, brotli ${kb(initialTotal.brotli).trim()}`,
  )
  for (const failure of failures) console.error(`over budget: ${failure}`)
  console.log(failures.length ? `${String(failures.length)} over budget` : 'within budget')
  process.exitCode = failures.length ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
