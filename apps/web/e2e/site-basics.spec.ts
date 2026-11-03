import { expect, test } from '@playwright/test'

// Professional site basics (roadmap M8 step 4): on every public page type the head links the
// icons, the manifest and the share image, each of which answers 200 with the right type, and
// the footer carries its links.

const pages = [
  '/',
  '/states',
  '/states/mt',
  '/compare',
  '/compare/categories',
  '/compare/map',
  '/compare/states',
  '/compare/states/ne-vs-mt',
  '/compare/codes',
  '/compare/test-psychoses',
  '/codes/icd-10-cm/F20.0',
  '/search',
  '/about',
  '/disclaimer',
  '/privacy',
  '/accessibility',
] as const

const expectedType: Record<string, RegExp> = {
  '/favicon.svg': /^image\/svg\+xml/,
  '/favicon-32.png': /^image\/png/,
  '/apple-touch-icon.png': /^image\/png/,
  '/site.webmanifest': /^application\/(manifest\+)?json/,
  '/og-image.png': /^image\/png/,
}

for (const path of pages) {
  test(`${path} links the icons, manifest and share image, and has the footer links`, async ({
    page,
    request,
  }) => {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()

    const head = page.locator('head')
    const hrefs = {
      svg: await head.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href'),
      png: await head.locator('link[rel="icon"][type="image/png"]').getAttribute('href'),
      apple: await head.locator('link[rel="apple-touch-icon"]').getAttribute('href'),
      manifest: await head.locator('link[rel="manifest"]').getAttribute('href'),
    }
    await expect(head.locator('meta[name="theme-color"]')).toHaveCount(2)
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )
    const ogImage = await head.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage).toMatch(/^https?:\/\/[^/]+\/og-image\.png$/)

    for (const href of [...Object.values(hrefs), new URL(ogImage ?? '').pathname]) {
      expect(href).toBeTruthy()
      const res = await request.get(href ?? '')
      expect(res.status(), href ?? '').toBe(200)
      expect(res.headers()['content-type'], href ?? '').toMatch(expectedType[href ?? ''] ?? /^$/)
    }

    const footerNav = page
      .getByRole('contentinfo')
      .getByRole('navigation', { name: 'About this site' })
    await expect(footerNav.getByRole('link')).toHaveCount(6)
    for (const name of [
      'About and methodology',
      'Disclaimer',
      'Privacy',
      'Accessibility',
      'Source code',
      'Report a problem',
    ]) {
      await expect(footerNav.getByRole('link', { name, exact: true })).toBeVisible()
    }
  })
}

test('the manifest names the site and its icons resolve', async ({ request }) => {
  const res = await request.get('/site.webmanifest')
  const manifest = (await res.json()) as { name: string; icons: { src: string; type: string }[] }
  expect(manifest.name).toBe('Medical Frailty Coding Dashboard')
  for (const icon of manifest.icons) {
    const iconRes = await request.get(icon.src)
    expect(iconRes.status(), icon.src).toBe(200)
    expect(iconRes.headers()['content-type'], icon.src).toContain(icon.type)
  }
})

test('security.txt names the reporting page and a future expiry', async ({ request }) => {
  const res = await request.get('/.well-known/security.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/^text\/plain/)
  const text = await res.text()
  expect(text).toMatch(/^Contact: https:\/\/github\.com\/.+\/security\/advisories\/new$/m)
  const expires = /^Expires: (.+)$/m.exec(text)?.[1] ?? ''
  expect(Date.parse(expires)).toBeGreaterThan(Date.now())
})
