import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Runs in the "admin" project (playwright.config.ts): bulk remap on /admin/categories (M7
// step 3). Select every Louisiana category, choose a federal category, check the preview, save.
// The database is kept between runs and shared with the unified spec (which may place the
// Behavioral Health entries in a unified category), so the preview's numbers are not fixed:
// the test checks the confirm step's parts, not its counts.

test('previews a bulk remap with the keyboard, cancels, then saves it', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/admin/categories')
  await page.getByLabel('State', { exact: true }).selectOption('Louisiana')
  await expect(page.getByRole('table', { name: 'Categories of Louisiana' })).toBeVisible()

  const selectAll = page.getByRole('checkbox', { name: /Select all \d+ categories of Louisiana/ })
  await selectAll.focus()
  await page.keyboard.press('Space')
  await expect(selectAll).toBeChecked()
  await page
    .getByLabel('Federal category for the selected categories')
    .selectOption('state_specific')
  const previewButton = page.getByRole('button', { name: 'Preview remap' })
  await previewButton.focus()
  await page.keyboard.press('Enter')

  const region = page.getByRole('region', { name: 'Check the remap before saving' })
  await expect(region.getByRole('heading', { name: 'Check the remap before saving' })).toBeFocused()
  await expect(region.getByRole('heading', { name: /Behavioral Health → / })).toBeVisible()
  await expect(region).toContainText(/will move|stay in|already in|No published entry/)
  await expect(region.getByRole('table', { name: /per federal category/ })).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])

  await region.getByRole('button', { name: 'Cancel' }).click()
  await expect(region).toBeHidden()
  await expect(previewButton).toBeFocused()

  await previewButton.click()
  await region.getByRole('button', { name: 'Save remap' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Remapped' })).toContainText(
    /Remapped \d+ items? in Louisiana\./,
  )
  const row = page
    .getByRole('table', { name: 'Categories of Louisiana' })
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Behavioral Health' }) })
  await expect(row).toContainText('Confirmed by')
  expect(errors).toEqual([])
})

test('no serious accessibility problems in the remap preview (dark)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/admin/categories')
  await page.getByLabel('State', { exact: true }).selectOption('Louisiana')
  await page.getByRole('checkbox', { name: 'Select Behavioral Health' }).check()
  await page.getByLabel('Federal category for the selected categories').selectOption('sud')
  await page.getByRole('button', { name: 'Preview remap' }).click()
  await expect(
    page.getByRole('region', { name: 'Check the remap before saving' }).getByRole('button', {
      name: 'Save remap',
    }),
  ).toBeEnabled()
  expect(await seriousA11yViolations(page)).toEqual([])
})
