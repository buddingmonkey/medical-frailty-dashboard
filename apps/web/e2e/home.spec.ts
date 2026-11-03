import { expect, type Page, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

async function chooseTheme(page: Page, name: 'System' | 'Light' | 'Dark') {
  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.getByRole('menuitemradio', { name }).click()
}

test('home page loads with security headers and no console errors', async ({ page }) => {
  const errors = collectErrors(page)
  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy']).not.toContain('unsafe-inline')
  expect(headers['x-content-type-options']).toBe('nosniff')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Compare medical frailty codes by state' }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('unknown paths show the app’s not-found page', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
})

const MAP = 'Map of state frailty code lists'

test('the state map is keyboard navigable and has a table view', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const map = page.getByRole('group', { name: MAP })
  await expect(map.getByRole('link')).toHaveCount(51)

  // Tab order is alphabetical: Alabama, then Alaska.
  await map.getByRole('link', { name: /^Alabama:/ }).focus()
  await page.keyboard.press('Tab')
  await expect(map.getByRole('link', { name: /^Alaska:/ })).toBeFocused()
  await expect(page.getByRole('region', { name: 'Alaska' })).toBeVisible()

  await page.getByRole('button', { name: 'Table' }).click()
  const table = page.getByRole('table', { name: 'State frailty code lists' })
  await expect(table.getByRole('row')).toHaveCount(52)
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('no serious accessibility problems in the light theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('group', { name: MAP })).toBeVisible()

  expect(await seriousA11yViolations(page)).toEqual([])
})

test('no serious accessibility problems in the dark theme, menu open and closed', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('group', { name: MAP })).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])

  await page.getByRole('button', { name: 'Theme: Dark' }).click()
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])
})

test('a saved theme is applied before the app script runs', async ({ page }) => {
  await page.goto('/')
  await chooseTheme(page, 'Dark')

  // Block the Vue bundle: only public/theme-init.js can set the theme now.
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('admin pages and the audit API refuse a visitor who is not signed in', async ({ request }) => {
  for (const path of ['/admin', '/admin/audit', '/api/admin/audit']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(401)
    expect(res.headers()['x-robots-tag'], path).toBe('noindex, nofollow')
    expect(res.headers()['cache-control'], path).toBe('no-store')
  }
})

// The tile map (roadmap M5 step 8). e2e/fixtures/public-seed.sql publishes "Test alcohol use"
// (substance use disorder, first by federal order; Montana 100%, not reviewed) and "Test
// psychoses" (Montana 33%); Nebraska has a list with nothing in either.
const ALCOHOL = 'Test alcohol use: each state’s share of the codes any state lists'
const PSYCHOSES = 'Test psychoses: share of the category’s codes that each state lists'

test('the tile map: picker changes the map and the URL, tiles link to the drill-down', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const map = page.getByRole('group', { name: ALCOHOL })
  await expect(map.getByRole('listitem')).toHaveCount(51)
  await expect(
    map.getByRole('link', {
      name: 'Montana, Test alcohol use: 100% of the codes any state lists, not reviewed',
    }),
  ).toHaveAttribute('href', '/compare/test-alcohol-use?focus=MT')
  await expect(
    map.getByRole('link', { name: 'Nebraska, Test alcohol use: 0%, none listed' }),
  ).toBeVisible()
  await expect(map.getByRole('link')).toHaveCount(2)

  await page.getByRole('combobox', { name: 'Category' }).selectOption('test-psychoses')
  await expect(page).toHaveURL(/\/\?category=test-psychoses$/)
  const psychoses = page.getByRole('group', { name: PSYCHOSES })
  const mt = psychoses.getByRole('link', {
    name: 'Montana, Test psychoses: 33% of the category’s codes',
  })
  await expect(mt).toHaveAttribute('href', '/compare/test-psychoses?focus=MT')
  await mt.click()
  await expect(page).toHaveURL(/\/compare\/test-psychoses\?focus=MT$/)
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the tile map and its table pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByRole('group', { name: ALCOHOL })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])

    await page.getByText('Show as a table').click()
    const table = page.getByRole('table', { name: ALCOHOL })
    await expect(table.getByRole('row')).toHaveCount(52)
    await expect(table.getByRole('row', { name: /^Montana/ })).toContainText('100% (not reviewed)')
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}

test('the tile map fits a 390 px phone without a horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const map = page.getByRole('group', { name: ALCOHOL })
  await expect(map).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  const box = await map.boundingBox()
  expect(box?.width ?? 0).toBeLessThanOrEqual(390 - 32)
})

test.describe('the tile map with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the default category is a table in the HTML', async ({ page }) => {
    await page.goto('/')
    const table = page.getByRole('table', { name: ALCOHOL })
    await expect(table.getByRole('row', { name: /^Montana/ })).toContainText('100% (not reviewed)')
    await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('test-alcohol-use')
  })
})
