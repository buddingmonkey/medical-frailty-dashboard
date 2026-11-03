import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Code search (roadmap M6 step 2). The e2e database has no CMS reference codes, so the words
// match Montana's own text for F20.0 (e2e/fixtures/public-seed.sql).

for (const theme of ['light', 'dark'] as const) {
  test(`typing finds a code and opens its page (${theme})`, async ({ page }) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Search' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Search codes' })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Code number or words' }).fill('paranoid')
    const results = page.getByRole('list', { name: 'Search results' })
    const item = results.getByRole('listitem').filter({ hasText: 'F20.0' })
    await expect(item).toContainText('Paranoid schizophrenia')
    await expect(item).toContainText('Text published by Montana')
    await expect(item).toContainText(/Listed by 1 of \d+ states? with a list on this site: Montana/)
    await expect(page.getByRole('status').filter({ hasText: /found/ })).toContainText(
      /codes? found/,
    )
    await expect(page).toHaveURL(/\/search\?q=paranoid$/)
    expect(await seriousA11yViolations(page)).toEqual([])

    await item.getByRole('link', { name: 'F20.0' }).click()
    await expect(page).toHaveURL(/\/codes\/icd-10-cm\/F20\.0$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('F20.0')
    expect(errors).toEqual([])
  })
}
