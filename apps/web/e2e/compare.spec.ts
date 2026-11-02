import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Compare by category (roadmap M4 step 2). Montana's three entries come from
// e2e/fixtures/public-seed.sql; no other state has a list in the e2e database.

test('pick a category and states, read the table, share the link', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Compare' })
    .click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Compare states by category' }),
  ).toBeVisible()
  await page
    .getByLabel('Federal category', { exact: true })
    .selectOption('disabling_mental_disorder')
  await page
    .getByRole('group', { name: 'States' })
    .getByRole('checkbox', { name: 'Montana' })
    .check()

  await expect(page).toHaveURL(/\/compare\?states=MT&category=disabling_mental_disorder$/)
  const table = page.getByRole('table', { name: 'Disabling mental disorder: codes by state' })
  const row = table.getByRole('row', { name: /F20\.0/ })
  await expect(row).toContainText('Paranoid schizophrenia')
  await expect(row).toContainText('Listed')
  await expect(row).toContainText('Tier 1 - DPHHS Approved Condition')
  await expect(row).toContainText('Qualifies alone')
  expect(await seriousA11yViolations(page)).toEqual([])

  // The same link in a new tab shows the same table.
  const shared = await page.context().newPage()
  await shared.goto(page.url())
  await expect(
    shared.getByRole('table', { name: 'Disabling mental disorder: codes by state' }),
  ).toContainText('F20.0')
  await expect(shared.getByLabel('Federal category', { exact: true })).toHaveValue(
    'disabling_mental_disorder',
  )
  expect(errors).toEqual([])
})

test("a state's category opens the compare page on it", async ({ page }) => {
  await page.goto('/states/mt')
  await page.getByRole('link', { name: 'Compare SMI with other states' }).click()

  await expect(page).toHaveURL(/\/compare\?states=MT&ownState=MT&ownCategory=SMI$/)
  await expect(page.getByRole('table', { name: 'Montana: SMI: codes by state' })).toContainText(
    'F20.0',
  )
})

test('the CSV has every row', async ({ request }) => {
  const res = await request.get('/compare.csv?states=MT,AL&category=sud')
  expect(res.status()).toBe(200)
  const lines = (await res.text()).trimEnd().split('\r\n')
  expect(lines).toHaveLength(2)
  expect(lines[1]).toContain('F10.20,"Alcohol dependence, uncomplicated",MT,Listed')
  expect(lines[1]).toContain('No list on this site')
})

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the table is in the HTML, and the page is not indexed', async ({ page }) => {
    await page.goto('/compare?states=MT,AL&category=sud')

    await expect(page).toHaveTitle('Compare states by category | Medical Frailty Coding Dashboard')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/compare$/)
    const table = page.getByRole('table', { name: 'Substance use disorder: codes by state' })
    await expect(table.getByRole('row', { name: /F10\.20/ })).toContainText(
      'Listed; Tier 1 - DPHHS Approved Condition; Qualifies alone',
    )
    await expect(table.getByRole('row', { name: /F10\.20/ })).toContainText('No list on this site')
  })
})
