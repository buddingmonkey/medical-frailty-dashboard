import { expect, type Page, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Runs in the "admin" project (playwright.config.ts): create a unified category with a CCSR
// group, map a Louisiana category to it, approve, see it listed as approved. The seed
// (e2e/fixtures/admin-seed.sql) gives Louisiana a published list and synthetic CCSR groups;
// the database is kept between runs, so each run names its own category.

async function createUnified(page: Page, label: string) {
  await page.goto('/admin/unified')
  await page.getByRole('button', { name: 'New unified category' }).click()
  const form = page.getByRole('form', { name: 'New unified category' })
  await form.getByLabel('Label').fill(label)
  await form.getByLabel('Definition').fill('Psychotic disorders (e2e).')
  await form.getByLabel('Federal parent').selectOption('disabling_mental_disorder')
  await form.getByLabel('Search CCSR groups').fill('schizophrenia')
  await form.getByRole('checkbox', { name: /TST001/ }).check()
  await expect(form.getByRole('button', { name: 'Remove TST001' })).toBeVisible()
  return form
}

test('creates a unified category, maps a state category to it and approves', async ({ page }) => {
  const errors = collectErrors(page)
  const label = `E2E SMI ${String(Date.now())}`
  const form = await createUnified(page, label)
  expect(await seriousA11yViolations(page)).toEqual([])
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toContainText(`Saved ${label}`)
  await expect(page.getByRole('rowheader', { name: label })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'Mappings' })
    .click()
  await page.getByLabel('State').selectOption('Louisiana')
  const table = page.getByRole('table', { name: 'Categories of Louisiana' })
  await table.getByRole('button', { name: 'Edit Behavioral Health' }).click()
  const mapForm = page.getByRole('form', { name: 'Map Behavioral Health' })
  const suggestion = mapForm.getByRole('region', { name: 'Suggestion' })
  await expect(suggestion).toContainText('TST001')
  await suggestion.getByRole('button', { name: `Add ${label} as a target` }).click()
  await mapForm.getByLabel('Relation for target 1').selectOption('broad')
  await expect(mapForm).toContainText('the unified category is wider than the state’s')
  expect(await seriousA11yViolations(page)).toEqual([])
  await mapForm.getByRole('button', { name: 'Save and approve' }).click()

  await expect(page.getByRole('status')).toContainText('Behavioral Health: Reviewed by one admin')
  const row = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Behavioral Health' }) })
  await expect(row).toContainText(`Broad: ${label}`)
  await expect(row).toContainText('Reviewed by one admin (e2e-admin@localhost')

  await page.goto('/admin/unified')
  const listed = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label }) })
  await expect(listed.getByRole('cell').nth(3)).toHaveText('1')
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on the unified pages (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await createUnified(page, `E2E a11y ${scheme}`)
    expect(await seriousA11yViolations(page)).toEqual([])

    await page.goto('/admin/mappings')
    await page.getByLabel('State').selectOption('Louisiana')
    await page.getByRole('button', { name: 'Edit Behavioral Health' }).click()
    await expect(page.getByRole('form', { name: 'Map Behavioral Health' })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}
