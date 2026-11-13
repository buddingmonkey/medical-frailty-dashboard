import { expect, type Page, test } from '@playwright/test'

import { a11yViolations, collectErrors } from './helpers'

// The accessibility pass (roadmap M8 step 2): every public page type, in both themes, passes
// axe at WCAG 2.2 A/AA with no violation of any impact, with JavaScript on and (for the pages the
// Worker renders) off. Interactive states (menus open, the map focused, search states) too.
// Data: e2e/fixtures/public-seed.sql (Montana and Nebraska lists, a condition group for like codes).

const pages = [
  { path: '/', heading: 'Compare medical frailty codes by state' },
  { path: '/states', heading: 'All states' },
  { path: '/states/mt', heading: 'Montana' },
  { path: '/states/al', heading: 'Alabama' },
  { path: '/compare', heading: 'How much of each category each state lists' },
  { path: '/compare/categories', heading: null },
  { path: '/compare/map', heading: null },
  { path: '/compare/overlaps', heading: 'Which states list the same codes' },
  {
    path: '/compare/overlaps?category=test-psychoses',
    heading: 'Which states list the same codes',
  },
  { path: '/compare/states', heading: null },
  { path: '/compare/codes', heading: 'Compare single codes' },
  { path: '/compare/codes?states=MT,NE&category=sud', heading: 'Compare single codes' },
  { path: '/compare/test-psychoses', heading: null },
  { path: '/compare/states/ne-vs-mt', heading: null },
  { path: '/search', heading: 'Search codes' },
  { path: '/search?q=paranoid', heading: 'Search codes' },
  { path: '/search?q=zzzzqqq', heading: 'Search codes' },
  { path: '/codes/icd-10-cm/F20.0', heading: 'F20.0' },
  { path: '/codes/hcpcs/E0465', heading: 'E0465' },
  { path: '/about', heading: 'About and methodology' },
  { path: '/disclaimer', heading: 'Disclaimer' },
  { path: '/privacy', heading: 'Privacy' },
  { path: '/accessibility', heading: 'Accessibility' },
  { path: '/no-such-page', heading: 'Page not found' },
] as const

async function ready(page: Page, heading: string | null) {
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toHaveCount(1)
  if (heading) await expect(h1).toContainText(heading)
  await page.waitForLoadState('networkidle')
  // No loading text left on the page.
  await expect(page.getByText(/^Loading/)).toHaveCount(0)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const info of pages) {
      test(`${info.path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        const errors = collectErrors(page)
        await page.goto(info.path)
        await ready(page, info.heading)
        expect(await a11yViolations(page)).toEqual([])
        expect(errors).toEqual([])
      })
    }

    test('the theme menu and the phone menu, open', async ({ page }) => {
      await page.goto('/states/mt')
      await ready(page, 'Montana')
      await page.getByRole('button', { name: /^Theme:/ }).click()
      await expect(page.getByRole('menu', { name: 'Theme' })).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])

      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 390, height: 800 })
      await page.getByRole('button', { name: 'Menu' }).click()
      await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(await a11yViolations(page)).toEqual([])
    })

    test('the home map with a state focused, and the map tab with a category', async ({ page }) => {
      await page.goto('/')
      await ready(page, null)
      const map = page.getByRole('group', { name: 'Map of state medical frailty code lists' })
      await map.getByRole('link', { name: /^Montana:/ }).focus()
      await expect(page.getByRole('region', { name: 'Montana' })).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])

      await page.goto('/compare/map?category=test-psychoses')
      await ready(page, null)
      await page.locator('main a, main button, main select').first().focus()
      await page.keyboard.press('Tab')
      expect(await a11yViolations(page)).toEqual([])
    })

    test('the overlaps tab with a row open, and at 320px with no sideways scroll', async ({
      page,
    }) => {
      await page.goto('/compare/overlaps?category=test-psychoses')
      await ready(page, 'Which states list the same codes')
      const table = page.getByRole('table', { name: /groups of states that list exactly/ })
      const first = table.getByRole('rowheader').first().getByRole('button')
      await first.click()
      await expect(first).toHaveAttribute('aria-expanded', 'true')
      expect(await a11yViolations(page)).toEqual([])

      await page.setViewportSize({ width: 320, height: 800 })
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(sideways).toBe(false)
      expect(await a11yViolations(page)).toEqual([])
    })

    test('search while loading and after an error', async ({ page }) => {
      let release: () => void = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/api/public/codes/search**', async (route) => {
        await held
        await route.continue()
      })
      await page.goto('/search')
      await ready(page, 'Search codes')
      await page.getByRole('searchbox', { name: 'Code number or words' }).fill('paranoid')
      await expect(page.getByRole('status').filter({ hasText: /Searching/i })).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])
      release()
      await expect(page.getByRole('status').filter({ hasText: /found/ })).toBeVisible()

      await page.unroute('**/api/public/codes/search**')
      await page.route('**/api/public/codes/search**', (route) =>
        route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }),
      )
      await page.getByRole('searchbox', { name: 'Code number or words' }).fill('schizo')
      await expect(page.getByRole('alert')).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])
    })
  })
}

// axe runs as a script in the page, so "JavaScript off" here is the Worker's HTML with every
// script request blocked: what a visitor without JavaScript gets.
test.describe('with scripts blocked', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*.js', (route) => route.abort())
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const path of [
      '/',
      '/states/mt',
      '/compare',
      '/compare/codes?states=MT,NE&category=sud',
      '/compare/states/ne-vs-mt',
      '/codes/icd-10-cm/F20.0',
      '/codes/hcpcs/E0465',
      '/about',
    ]) {
      test(`the Worker HTML of ${path} has no violations (${theme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme })
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('lang', 'en')
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
        expect(await a11yViolations(page)).toEqual([])
      })
    }
  }
})
