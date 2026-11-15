import { expect, test } from '@playwright/test'

// Our CSP (script-src 'self', no 'unsafe-eval') must raise no violation on public pages. Zod 4
// used to probe `new Function` once per page; `packages/shared/src/zod-config.ts` turns that off.

const pages = ['/', '/compare', '/compare/overlaps', '/codes/icd-10-cm/F20.0'] as const

for (const path of pages) {
  test(`${path} raises no Content-Security-Policy violation`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] }
      w.__csp = []
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)
      })
    })
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
    expect(violations).toEqual([])
  })
}
