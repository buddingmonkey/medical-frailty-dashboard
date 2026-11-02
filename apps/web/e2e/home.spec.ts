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

test('no serious accessibility problems in the light theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  expect(await seriousA11yViolations(page)).toEqual([])
})

test('no serious accessibility problems in the dark theme, menu open and closed', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
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
