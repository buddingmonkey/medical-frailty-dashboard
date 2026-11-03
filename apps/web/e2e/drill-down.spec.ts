import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// The category drill-down (roadmap M5 step 6). e2e/fixtures/public-seed.sql: Montana is the one
// state with a list; "Test psychoses" has a 3-code universe (F20.0, F20.1, F20.9), Montana lists
// F20.0; "Test alcohol use" has no CCSR group, so no full code list.

const caption = /Test psychoses: codes by how many states list them/

for (const scheme of ['light', 'dark'] as const) {
  test(`from an overview cell to the drill-down, details and axe (${scheme})`, async ({ page }) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/compare')
    await page
      .getByRole('link', { name: 'Montana, Test psychoses: 33% of the category’s codes' })
      .click()

    await expect(page).toHaveURL(/\/compare\/test-psychoses\?focus=MT$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Test psychoses' })).toBeVisible()
    await expect(page).toHaveTitle(
      'Test psychoses codes by state | Medical Frailty Coding Dashboard',
    )
    await expect(page.getByLabel('Focus state')).toHaveValue('MT')
    const table = page.getByRole('table', { name: caption })
    await expect(table.getByRole('columnheader', { name: 'Montana' })).toBeVisible()

    const group = table.getByRole('button', { name: 'F20', exact: true })
    await expect(group).toHaveAttribute('aria-expanded', 'false')
    await group.click()
    await expect(group).toHaveAttribute('aria-expanded', 'true')
    const row = table.getByRole('row', { name: /^F20\.0/ })
    await expect(row).toContainText('1 of 1 state')
    await expect(row).toContainText('Listed')

    await row.getByRole('button', { name: 'Details for F20.0' }).click()
    const panel = page.getByRole('region', { name: /F20\.0/ })
    await expect(panel).toContainText('Listed by 1 of 1 state with lists.')
    await expect(panel).toContainText('Montana')
    await expect(panel.getByRole('heading')).toBeFocused()
    expect(new URL(page.url()).searchParams.get('code')).toBe('icd10cm|exact|F200')

    expect(await seriousA11yViolations(page)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('include codes no state lists; filters; no full list elsewhere', async ({ page }) => {
  await page.goto('/compare/test-psychoses')
  const table = page.getByRole('table', { name: caption })
  await expect(table.getByRole('button', { name: 'F20', exact: true })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Include codes no state lists' }).check()
  await expect(page).toHaveURL(/all=1/)
  await page
    .getByRole('group', { name: 'Show' })
    .getByRole('button', { name: 'Gaps (under half)' })
    .click()
  await expect(page).toHaveURL(/show=gaps/)
  await expect(table.getByRole('row', { name: /^F20\.1/ })).toContainText('0 of 1 state')
  await expect(table.getByRole('row', { name: /^F20\.0 / })).toHaveCount(0)

  await page.goto('/compare/test-alcohol-use')
  await expect(page.getByRole('checkbox', { name: 'Include codes no state lists' })).toBeDisabled()
  await expect(
    page.getByText(
      'No full code list for this category, so only codes some state lists are shown.',
    ),
  ).toBeVisible()
})

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the codes are in the HTML, expanded; details and filters work by links and a form', async ({
    page,
  }) => {
    await page.goto('/compare/test-psychoses')
    await expect(page).toHaveTitle(
      'Test psychoses codes by state | Medical Frailty Coding Dashboard',
    )
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/compare\/test-psychoses$/,
    )
    await expect(page.getByText('Test schizophrenia group', { exact: false })).toBeVisible()
    const table = page.getByRole('table', { name: caption })
    await expect(table.getByRole('row', { name: /^F20\.0/ })).toContainText('1 of 1 state')

    await table
      .getByRole('row', { name: /^F20\.0/ })
      .getByRole('link', { name: 'Details' })
      .click()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByRole('region', { name: /F20\.0/ })).toContainText('Montana')

    await page.getByLabel('Include codes no state lists').check()
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/all=1/)
    await expect(table.getByRole('row', { name: /^F20\.9/ })).toContainText('0 of 1 state')
  })
})
