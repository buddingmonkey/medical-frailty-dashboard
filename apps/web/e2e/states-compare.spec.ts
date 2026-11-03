import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Compare 2–4 states and "states like mine" (roadmap M5 step 7). e2e/fixtures/public-seed.sql:
// Montana (F20.0 alone, F10.20 alone, Z99.11 doesn't say) and Nebraska (F10.20 needs another
// code, Z99.11 alone, J44.9 alone), similarity 0.50. F20.0 sits in "Test psychoses", F10.20 in
// "Test alcohol use" (Montana's placements), the rest in no unified category.

for (const scheme of ['light', 'dark'] as const) {
  test(`from a state's similar list to a two-state comparison, axe (${scheme})`, async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/states/mt')

    const similar = page.getByRole('region', { name: 'States with the most similar lists' })
    await expect(similar.getByRole('listitem')).toHaveCount(1)
    await expect(similar.getByRole('listitem')).toContainText('Nebraska')
    await expect(similar.getByRole('listitem')).toContainText('0.50')
    expect(await seriousA11yViolations(page)).toEqual([])
    await similar.getByRole('link', { name: 'Compare with Nebraska' }).click()

    await expect(page).toHaveURL(/\/compare\/states\/mt-vs-ne$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Montana vs Nebraska' })).toBeVisible()
    await expect(page).toHaveTitle(
      'Montana vs Nebraska medical frailty codes | Medical Frailty Coding Dashboard',
    )
    const summary = page.getByRole('region', { name: 'Summary' })
    await expect(summary).toContainText('Similarity')
    await expect(summary).toContainText('0.50')

    const table = page.getByRole('table', { name: 'Codes where Montana and Nebraska differ' })
    await expect(table.getByRole('rowheader', { name: /Test psychoses/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^F20\.0/ })).toContainText('Not listed')
    await expect(table.getByRole('row', { name: /^F10\.20/ })).toContainText('Needs another code')
    await expect(table.getByRole('rowheader', { name: /Not in a unified category/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^J44\.9/ })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])

    // Every code: nothing here is the same in both lists, so the rows stay.
    await page.getByRole('checkbox', { name: 'Show only differences' }).uncheck()
    await expect(page).toHaveURL(/\/compare\/states\/mt-vs-ne\?diff=0$/)
    await expect(
      page.getByRole('table', { name: 'Every code of Montana and Nebraska' }),
    ).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('the checkboxes and the pickers open a comparison', async ({ page }) => {
  await page.goto('/states/mt')
  const similar = page.getByRole('region', { name: 'States with the most similar lists' })
  await similar.getByRole('checkbox', { name: 'Nebraska' }).check()
  await similar.getByRole('button', { name: 'Compare Montana with 1 state' }).click()
  await expect(page).toHaveURL(/\/compare\/states\/mt-vs-ne$/)

  const pickers = page.getByRole('group', { name: 'States to compare' })
  await pickers.getByRole('combobox', { name: 'First state' }).selectOption('NE')
  await pickers.getByRole('combobox', { name: 'Second state' }).selectOption('MT')
  await pickers.getByRole('button', { name: 'Compare' }).click()
  await expect(page).toHaveURL(/\/compare\/states\/ne-vs-mt$/)
  await expect(page.getByRole('columnheader').nth(2)).toHaveText('Nebraska')
})

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the comparison is in the HTML, not indexed; the forms work without scripts', async ({
    page,
  }) => {
    await page.goto('/compare/states/ne-vs-mt')
    await expect(page).toHaveTitle(
      'Nebraska vs Montana medical frailty codes | Medical Frailty Coding Dashboard',
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/compare\/states\/mt-vs-ne$/,
    )
    const table = page.getByRole('table', { name: 'Codes where Nebraska and Montana differ' })
    await expect(table.getByRole('row', { name: /^J44\.9/ })).toContainText('Listed')

    // The state page's form, then the pickers' form: both redirect to a comparison.
    await page.goto('/states/mt')
    await page.getByRole('checkbox', { name: 'Nebraska' }).check()
    await page.getByRole('button', { name: 'Compare Montana with the chosen states' }).click()
    await expect(page).toHaveURL(/\/compare\/states\/mt-vs-ne$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Montana vs Nebraska' })).toBeVisible()
  })
})
