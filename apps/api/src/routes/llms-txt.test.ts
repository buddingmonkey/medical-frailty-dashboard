import { aboutPage, compareTabs, SITE_NAME } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'

// /llms.txt (llmstxt.org; roadmap M8 step 3; docs/seo.md, "llms.txt"): what the site is and
// where its pages and downloads are, for AI tools. Fixture: `seedStatesCompare` (GA, MT and NE
// have a published list, LA has announced one).

const HOST = 'frailty.example.org'
const ORIGIN = `http://${HOST}`

/** index.html for `/`, 404 for every other path: a link only resolves if the Worker serves it. */
const strictAssets: Fetcher = {
  fetch: (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return Promise.resolve(
      url.pathname === '/'
        ? new Response(
            '<!doctype html><html><head><title>app</title></head><body><div id="app"></div></body></html>',
            {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            },
          )
        : new Response('Not found', { status: 404 }),
    )
  },
  connect: () => {
    throw new Error('not used in tests')
  },
}

const publicVars = { SITE_MODE: 'public', ASSETS: strictAssets } as const

function get(path: string) {
  return call(path, { host: HOST, vars: publicVars })
}

/** Every Markdown link target, in order. */
const links = (text: string) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? '')

beforeEach(async () => {
  await seedStatesCompare()
})

describe('GET /llms.txt', () => {
  it('follows the llms.txt layout: title, summary, then sections of links', async () => {
    const res = await get('/llms.txt')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain;\s*charset=utf-8$/i)
    const text = await res.text()
    const lines = text.split('\n')
    expect(lines[0]).toBe(`# ${SITE_NAME}`)
    expect(lines[1]).toBe('')
    expect(lines[2]).toMatch(/^> .*medically frail/)
    expect(text).toMatch(/^## /m)
    // Every list item is a link with an optional note.
    for (const line of lines.filter((l) => l.startsWith('- '))) {
      expect(line).toMatch(/^- \[[^\]]+\]\(https?:\/\/[^)\s]+\)(: .+)?$/)
    }
  })

  it('links about, the states index, every compare tab, search, downloads and the sitemap', async () => {
    const found = links(await (await get('/llms.txt')).text())

    for (const path of [
      aboutPage.path,
      '/states',
      ...compareTabs.map((t) => t.path),
      '/search',
      '/sitemap.xml',
    ]) {
      expect(found).toContain(`${ORIGIN}${path}`)
    }
    for (const slug of ['ga', 'mt', 'ne']) {
      expect(found).toContain(`${ORIGIN}/states/${slug}`)
      expect(found).toContain(`${ORIGIN}/states/${slug}/codes.csv`)
      expect(found).toContain(`${ORIGIN}/states/${slug}/codes.json`)
    }
    // An announced list has no downloads yet.
    expect(found).not.toContain(`${ORIGIN}/states/la/codes.csv`)
    expect(found.every((url) => url.startsWith(`${ORIGIN}/`))).toBe(true)
    expect(new Set(found).size).toBe(found.length)
  })

  it('links only addresses that resolve', async () => {
    const found = links(await (await get('/llms.txt')).text())
    expect(found.length).toBeGreaterThan(10)

    for (const url of found) {
      const res = await get(new URL(url).pathname)
      expect.soft(res.status, url).toBe(200)
    }
  })

  it('is readable without signing in while the site is private, with no links', async () => {
    const res = await call('/llms.txt', { host: HOST })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const text = await res.text()
    expect(text.split('\n')[0]).toBe(`# ${SITE_NAME}`)
    expect(text).toContain('not public yet')
    expect(links(text)).toEqual([])
  })
})
