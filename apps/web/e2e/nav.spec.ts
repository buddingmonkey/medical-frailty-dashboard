import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// The main navigation (project lead, 2026-11-02): a bar on wide screens, a menu on phones.

test('the nav bar reaches every page and marks the current one', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('button', { name: 'Menu' })).toBeHidden()

  await nav.getByRole('link', { name: 'States' }).click()
  await expect(page).toHaveURL(/\/states$/)
  await expect(page.getByRole('heading', { level: 1, name: 'All states' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'States' })).toHaveAttribute('aria-current', 'page')

  await page
    .getByRole('table', { name: 'State frailty code lists' })
    .getByRole('link', { name: 'Montana' })
    .click()
  await expect(nav.getByRole('link', { name: 'States' })).toHaveAttribute('aria-current', 'true')

  await nav.getByRole('link', { name: 'Compare' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Compare states by category' }),
  ).toBeVisible()
  await nav.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark'] as const) {
  test(`on a phone the menu opens, navigates and closes (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const menu = nav.getByRole('button', { name: 'Menu' })

    await expect(nav.getByRole('link', { name: 'Compare' })).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(await seriousA11yViolations(page)).toEqual([])
    await nav.getByRole('link', { name: 'Compare' }).click()

    await expect(page).toHaveURL(/\/compare$/)
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'Compare' })).toBeHidden()
  })
}
