import { describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { SECURITY_CONTACT, SECURITY_POLICY } from './security-txt'

// /.well-known/security.txt (RFC 9116; roadmap M8 step 4; docs/security.md): how to report a
// vulnerability. Readable without signing in while the site is private, like robots.txt.

/** The `Field: value` lines, by field name. */
function fields(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z-]+): (.+)$/.exec(line)
    if (!m?.[1] || !m[2]) continue
    out.set(m[1], [...(out.get(m[1]) ?? []), m[2]])
  }
  return out
}

describe('GET /.well-known/security.txt', () => {
  it('gives the contact, expiry, language, canonical URL and policy as plain text', async () => {
    const res = await call('/.well-known/security.txt', {
      host: 'frailty.example.org',
      vars: { SITE_MODE: 'public' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain; charset=utf-8$/i)
    const f = fields(await res.text())
    expect(f.get('Contact')).toEqual([SECURITY_CONTACT])
    expect(SECURITY_CONTACT).toMatch(
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/security\/advisories\/new$/,
    )
    expect(f.get('Preferred-Languages')).toEqual(['en'])
    expect(f.get('Canonical')).toEqual(['https://frailty.example.org/.well-known/security.txt'])
    expect(f.get('Policy')).toEqual([SECURITY_POLICY])
    expect(SECURITY_POLICY).toMatch(/^https:\/\/github\.com\/.+\/SECURITY\.md$/)
  })

  it('expires within a year, never in the past', async () => {
    const res = await call('/.well-known/security.txt', { vars: { SITE_MODE: 'public' } })
    const [expires] = fields(await res.text()).get('Expires') ?? []
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    const at = Date.parse(expires ?? '')
    const now = Date.now()
    expect(at).toBeGreaterThan(now + 300 * 86_400_000)
    // RFC 9116 asks for less than a year.
    expect(at).toBeLessThanOrEqual(now + 366 * 86_400_000)
  })

  it('is readable without signing in while the site is private, never indexed', async () => {
    const res = await call('/.well-known/security.txt')

    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(fields(await res.text()).get('Contact')).toEqual([SECURITY_CONTACT])
  })

  it('keeps the rest of /.well-known behind the gate while private', async () => {
    const res = await call('/.well-known/other.txt')
    expect(res.status).toBe(401)
  })
})
