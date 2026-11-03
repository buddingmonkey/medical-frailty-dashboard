import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// The overview matrix at /compare (roadmap M5 step 5). e2e/fixtures/public-seed.sql gives
// Montana a list and two published unified categories: "Test alcohol use" (substance use
// disorder; 100%, not reviewed) and "Test psychoses" (disabling mental disorder; 33%).

const caption = 'Share of each category’s codes that each state lists'

for (const scheme of ['light', 'dark'] as const) {
  test(`the matrix shows numbers, links each cell and passes axe (${scheme})`, async ({ page }) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/compare')

    const table = page.getByRole('table', { name: caption })
    const montana = table.getByRole('row', { name: /^Montana/ })
    await expect(
      montana.getByRole('link', {
        name: 'Montana, Test alcohol use: 100% of the codes any state lists, not reviewed',
      }),
    ).toHaveAttribute('href', '/compare/test-alcohol-use?focus=MT')
    await expect(
      montana.getByRole('link', {
        name: 'Montana, Test psychoses: 33% of the category’s codes',
      }),
    ).toHaveAttribute('href', '/compare/test-psychoses?focus=MT')
    await expect(montana.getByRole('cell').last()).toHaveText('67%')
    await expect(table.getByRole('row', { name: /^Alabama/ }).getByRole('cell')).toHaveText(
      'No list on this site yet',
    )
    await expect(table.getByRole('row')).toHaveCount(53)
    expect(await seriousA11yViolations(page)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('sort a column by keyboard; the order is announced', async ({ page }) => {
  await page.goto('/compare')
  const table = page.getByRole('table', { name: caption })
  const button = table.getByRole('button', { name: 'Test psychoses' })

  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: 'Test psychoses' })).toHaveAttribute(
    'aria-sort',
    'descending',
  )
  await expect(page.getByRole('status')).toHaveText('Sorted by Test psychoses, highest first.')
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: 'Test psychoses' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  // Montana is the only state with a list, so it stays first either way.
  await expect(table.getByRole('rowheader').first()).toHaveText('Montana')
})

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the matrix is in the HTML and the page is indexed', async ({ page }) => {
    await page.goto('/compare')

    await expect(page).toHaveTitle('Which states cover what | Medical Frailty Coding Dashboard')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/compare$/)
    const montana = page
      .getByRole('table', { name: caption })
      .getByRole('row', { name: /^Montana/ })
    await expect(montana).toContainText('100% (not reviewed)')
    await expect(montana.getByRole('link', { name: '33%' })).toHaveAttribute(
      'href',
      '/compare/test-psychoses?focus=MT',
    )
  })
})
