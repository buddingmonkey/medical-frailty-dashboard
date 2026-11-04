import { expect, type Page, test } from '@playwright/test'

import { a11yViolations, collectErrors } from './helpers'

// The accessibility pass on every admin page (roadmap M8 step 2), signed in by the dev bypass
// (playwright.config.ts, admin project), in both themes, at WCAG 2.2 A/AA with no violation of
// any impact. Forms that open in place are checked open. Data: e2e/fixtures/admin-seed.sql.

const pages = [
  '/admin',
  '/admin/guide',
  '/admin/ingest',
  '/admin/drafts',
  '/admin/versions',
  '/admin/sources',
  '/admin/categories',
  '/admin/mappings',
  '/admin/unified',
  '/admin/condition-groups',
  '/admin/launch-readiness',
  '/admin/watch',
  '/admin/restore',
  '/admin/audit',
]

async function ready(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(/^Loading/)).toHaveCount(0)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`admin axe, ${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const path of pages) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        const errors = collectErrors(page)
        await page.goto(path)
        await ready(page)
        expect(await a11yViolations(page)).toEqual([])
        expect(errors).toEqual([])
      })
    }

    test('forms opened in place: source details, watch item, condition group', async ({ page }) => {
      await page.goto('/admin/sources')
      await ready(page)
      await page.getByLabel('State').selectOption('Louisiana')
      await page.getByRole('button', { name: 'Edit details of “E2E Louisiana list”' }).click()
      await expect(
        page.getByRole('form', { name: 'Edit details of “E2E Louisiana list”' }),
      ).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])

      await page.goto('/admin/watch')
      await ready(page)
      await page.getByRole('button', { name: 'Add an item' }).click()
      await expect(page.getByRole('heading', { name: 'Add an item' })).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])

      await page.goto('/admin/condition-groups')
      await ready(page)
      await page.getByRole('button', { name: 'New condition group' }).click()
      await expect(page.getByRole('form')).toBeVisible()
      expect(await a11yViolations(page)).toEqual([])
    })
  })
}
