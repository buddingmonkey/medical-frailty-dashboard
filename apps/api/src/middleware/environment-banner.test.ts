import { describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'

// The test-site banner (docs/deployment.md, "Preview data"): every HTML page of any Worker that
// is not production says it holds test data. Added at run time from ENVIRONMENT, so preview and
// production run the same build, and a missing or wrong value shows the banner, never hides it.

const page = `<!doctype html>
<html lang="en">
  <head><title>Medical Frailty Coding Dashboard</title></head>
  <body>
    <div id="app"></div>
  </body>
</html>`

function assets(): Fetcher {
  return {
    fetch: () =>
      Promise.resolve(
        new Response(page, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-length': String(page.length),
          },
        }),
      ),
    connect: () => {
      throw new Error('not used in tests')
    },
  }
}

let calls = 0
function get(path: string, environment: string) {
  calls += 1
  return call(path, {
    host: `banner-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public', ENVIRONMENT: environment, ASSETS: assets() },
  })
}

const BANNER = /<body>\s*<aside class="env-banner" aria-label="Test site">/

describe('environment banner', () => {
  it('opens the body of every preview page: the Vue shell and server-rendered pages', async () => {
    for (const path of ['/admin-free-path', '/', '/states']) {
      const res = await get(path, 'preview')
      const text = await res.text()
      expect(text, path).toMatch(BANNER)
      expect(text).toContain('<strong>Preview site.</strong> Test data, not the real state lists.')
      // Exactly one, and Vue's #app is untouched (the banner sits outside it).
      expect(text.match(/env-banner/g)).toHaveLength(1)
      expect(text).toMatch(/<\/aside>\s*<div id="app">/)
    }
  })

  it('keeps the security headers and drops a Content-Length that no longer fits', async () => {
    const res = await get('/somewhere', 'preview')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('content-length')).toBeNull()
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('says local development on a local Worker', async () => {
    const text = await (await get('/x', 'development')).text()
    expect(text).toContain(
      '<strong>Local development.</strong> Test data, not the real state lists.',
    )
  })

  it('shows a plain test-site banner for any other value, so a wrong setting fails safe', async () => {
    for (const environment of ['staging', '', 'Production']) {
      const text = await (await get('/x', environment)).text()
      expect(text, environment).toContain('<strong>Test site.</strong> Not the live data.')
    }
  })

  it('adds nothing on production', async () => {
    const text = await (await get('/x', 'production')).text()
    expect(text).not.toContain('env-banner')
    expect(text).toBe(page)
  })

  it('leaves responses that are not HTML alone', async () => {
    const res = await get('/api/public/health', 'preview')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.text()).not.toContain('env-banner')
  })
})
