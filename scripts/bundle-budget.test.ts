import { describe, expect, it } from 'vitest'

import {
  ADMIN_ONLY,
  BUDGETS,
  checkBudgets,
  chunkName,
  initialFiles,
  measure,
  OTHER_CHUNK_BROTLI,
  type Sized,
} from './bundle-budget.ts'

const indexHtml = `<!doctype html><html><head>
<script src="/theme-init.js"></script>
<script type="module" crossorigin src="/assets/index-gGmhciKj.js"></script>
<link rel="modulepreload" crossorigin href="/assets/runtime-core.esm-bundler-GIwZZenQ.js">
<link rel="modulepreload" crossorigin href="/assets/src-Bm6E1KNl.js">
<link rel="stylesheet" crossorigin href="/assets/index-lcprpjyd.css">
<link rel="preload" href="/assets/jost-latin-wght-normal-ObQm3Zd1.woff2" as="font" type="font/woff2" crossorigin="">
</head><body></body></html>`

const sized = (file: string, brotli: number, gzip = brotli + 1000): Sized => ({
  file,
  name: chunkName(file),
  raw: brotli * 3,
  gzip,
  brotli,
})

describe('bundle budget (M8 step 3)', () => {
  it('names a chunk without its content hash', () => {
    expect(chunkName('assets/index-gGmhciKj.js')).toBe('index.js')
    expect(chunkName('assets/(home)-CShPljfT.js')).toBe('(home).js')
    expect(chunkName('assets/_...missingPath_-BYgPzmAT.js')).toBe('_...missingPath_.js')
    expect(chunkName('assets/runtime-core.esm-bundler-GIwZZenQ.js')).toBe(
      'runtime-core.esm-bundler.js',
    )
    expect(chunkName('assets/pdf.worker.min-Dkey6ZUl.mjs')).toBe('pdf.worker.min.mjs')
    expect(chunkName('assets/index-lcprpjyd.css')).toBe('index.css')
    // Hashes may hold - and _.
    expect(chunkName('assets/StatesPicker-C9_00r-H.js')).toBe('StatesPicker.js')
  })

  it('finds the scripts and styles every page loads first, not fonts or public files', () => {
    expect(initialFiles(indexHtml)).toEqual([
      'assets/index-gGmhciKj.js',
      'assets/runtime-core.esm-bundler-GIwZZenQ.js',
      'assets/src-Bm6E1KNl.js',
      'assets/index-lcprpjyd.css',
    ])
  })

  it('measures gzip and brotli sizes', () => {
    const text = 'const x = 1;\n'.repeat(500)
    const m = measure('assets/a-12345678.js', Buffer.from(text))
    expect(m.raw).toBe(text.length)
    expect(m.gzip).toBeGreaterThan(0)
    expect(m.gzip).toBeLessThan(m.raw)
    expect(m.brotli).toBeLessThan(m.gzip)
  })

  it('passes within budget and fails a group over it', () => {
    const files = [
      sized('assets/index-aaaaaaaa.js', 10_000),
      sized('assets/(home)-bbbbbbbb.js', 40_000),
    ]
    const initial = ['assets/index-aaaaaaaa.js']
    const budgets = [
      { group: 'initial', brotli: 20_000, gzip: 30_000 },
      { group: '(home).js', brotli: 50_000, gzip: 60_000 },
    ]
    expect(checkBudgets(files, initial, budgets).failures).toEqual([])

    const tight = [
      { group: 'initial', brotli: 20_000, gzip: 30_000 },
      { group: '(home).js', brotli: 39_999, gzip: 60_000 },
    ]
    expect(checkBudgets(files, initial, tight).failures).toEqual([
      '(home).js: brotli 40000 B is over its budget of 39999 B',
    ])
  })

  it('fails when admin-only code loads on every page', () => {
    const files = [sized('assets/index-aaaaaaaa.js', 1000), sized('assets/pdf-cccccccc.js', 1000)]
    const result = checkBudgets(files, ['assets/index-aaaaaaaa.js', 'assets/pdf-cccccccc.js'], [])
    expect(result.failures).toContain(
      'assets/pdf-cccccccc.js is admin-only code but every page loads it (dist/index.html)',
    )
  })

  it('fails a lazy chunk over the catch-all limit and a budget group that vanished', () => {
    const files = [sized('assets/Huge-dddddddd.js', 999_999)]
    const failures = checkBudgets(files, [], [{ group: 'gone.js', brotli: 1, gzip: 1 }]).failures
    expect(failures).toContain(
      `Huge.js: brotli 999999 B is over its budget of ${String(OTHER_CHUNK_BROTLI)} B (any other chunk)`,
    )
    expect(failures).toContain(
      'gone.js: no file in the build; update BUDGETS in scripts/bundle-budget.ts',
    )
  })

  it('adds up every file of a group: the worker has its own copy of pdf.js', () => {
    const files = [sized('assets/pdf-aaaaaaaa.js', 600), sized('assets/pdf-bbbbbbbb.js', 600)]
    expect(
      checkBudgets(files, [], [{ group: 'pdf.js', brotli: 1000, gzip: 99_999 }]).failures,
    ).toEqual(['pdf.js: brotli 1200 B is over its budget of 1000 B'])
  })

  it('budgets every group it names and lists the admin-only chunks', () => {
    expect(BUDGETS.map((b) => b.group)).toContain('initial')
    for (const b of BUDGETS) expect(b.gzip).toBeGreaterThan(b.brotli)
    expect(ADMIN_ONLY.test('pdf.js')).toBe(true)
    expect(ADMIN_ONLY.test('ingest.js')).toBe(true)
    expect(ADMIN_ONLY.test('(home).js')).toBe(false)
  })
})
