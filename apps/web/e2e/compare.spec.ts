import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// The code table (roadmap M4 step 2; at /compare/codes since M5 step 5). Montana's three
// entries come from e2e/fixtures/public-seed.sql (Nebraska also has a list since M5 step 7).

test('pick a category and states, read the table, share the link', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Compare' })
    .click()
  await page
    .getByRole('navigation', { name: 'Compare views' })
    .getByRole('link', { name: 'Single codes' })
    .click()

  await expect(page.getByRole('heading', { level: 1, name: 'Compare single codes' })).toBeVisible()
  await page
    .getByLabel('Federal category', { exact: true })
    .selectOption('disabling_mental_disorder')
  await page
    .getByRole('group', { name: 'States' })
    .getByRole('checkbox', { name: 'Montana' })
    .check()

  await expect(page).toHaveURL(/\/compare\/codes\?states=MT&category=disabling_mental_disorder$/)
  const table = page.getByRole('table', { name: 'Disabling mental disorder: codes by state' })
  const row = table.getByRole('row', { name: /F20\.0/ })
  await expect(row).toContainText('Paranoid schizophrenia')
  await expect(row).toContainText('Listed')
  await expect(row).toContainText('Tier 1 - DPHHS Approved Condition')
  await expect(row).toContainText('Enough by itself')
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
  await page.getByRole('link', { name: 'Compare these codes (SMI) with other states' }).click()

  await expect(page).toHaveURL(/\/compare\/codes\?states=MT&ownState=MT&ownCategory=SMI$/)
  await expect(page.getByRole('table', { name: 'Montana: SMI: codes by state' })).toContainText(
    'F20.0',
  )
})

test('an old /compare link redirects to the code table', async ({ page, request }) => {
  const res = await request.get('/compare?states=MT&category=sud', { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(res.headers()['location']).toBe('/compare/codes?states=MT&category=sud')
  await page.goto('/compare?states=MT&category=sud')
  await expect(page).toHaveURL(/\/compare\/codes\?states=MT&category=sud$/)
  await expect(
    page.getByRole('table', { name: 'Substance use disorder: codes by state' }),
  ).toContainText('F10.20')
})

test('the CSV has every row', async ({ request }) => {
  const res = await request.get('/compare/codes.csv?states=MT,AL&category=sud')
  expect(res.status()).toBe(200)
  const lines = (await res.text()).trimEnd().split('\r\n')
  expect(lines).toHaveLength(2)
  const row = lines[1] ?? ''
  expect(row).toContain('F10.20,"Alcohol dependence, uncomplicated",MT,')
  // The columns are alphabetical by name (project lead, 2026-11-13): Alabama, then Montana.
  expect(row.indexOf('No list on this site')).toBeGreaterThan(-1)
  expect(row.indexOf('No list on this site')).toBeLessThan(row.indexOf('Listed'))
})

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the table is in the HTML, and the page is not indexed', async ({ page }) => {
    await page.goto('/compare/codes?states=MT,AL&category=sud')

    await expect(page).toHaveTitle('Compare single codes | Medical Frailty Coding Dashboard')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/compare\/codes$/)
    const table = page.getByRole('table', { name: 'Substance use disorder: codes by state' })
    await expect(table.getByRole('row', { name: /F10\.20/ })).toContainText(
      'Listed; Tier 1 - DPHHS Approved Condition; Enough by itself',
    )
    await expect(table.getByRole('row', { name: /F10\.20/ })).toContainText('No list on this site')
  })
})

// The tile map on the Map tab (roadmap M5 step 8; on the home page until 2026-11-03). e2e/fixtures/public-seed.sql publishes "Test alcohol use"
// (substance use disorder, first by federal order; Montana 100%, not reviewed) and "Test
// psychoses" (Montana 33%); Nebraska has a list with nothing in either.
const ALCOHOL = 'Test alcohol use: each state’s share of the entries any state lists'
const PSYCHOSES =
  'Test psychoses: share of the category’s diagnosis codes that each state’s list includes'

test('the tile map: picker changes the map and the URL, tiles link to the drill-down', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/compare/map')
  const map = page.getByRole('group', { name: ALCOHOL })
  await expect(map.getByRole('listitem')).toHaveCount(51)
  await expect(
    map.getByRole('link', {
      name: 'Montana, Test alcohol use: 100% of the entries any state lists, not yet reviewed',
    }),
  ).toHaveAttribute('href', '/compare/test-alcohol-use?focus=MT')
  await expect(
    map.getByRole('link', { name: 'Nebraska, Test alcohol use: 0%, none listed' }),
  ).toBeVisible()
  await expect(map.getByRole('link')).toHaveCount(2)

  await page.getByRole('combobox', { name: 'Category' }).selectOption('test-psychoses')
  await expect(page).toHaveURL(/\/compare\/map\?category=test-psychoses$/)
  const psychoses = page.getByRole('group', { name: PSYCHOSES })
  const mt = psychoses.getByRole('link', {
    name: 'Montana, Test psychoses: 33% of the category’s diagnosis codes',
  })
  await expect(mt).toHaveAttribute('href', '/compare/test-psychoses?focus=MT')
  await mt.click()
  await expect(page).toHaveURL(/\/compare\/test-psychoses\?focus=MT$/)
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the tile map and its table pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/compare/map')
    await expect(page.getByRole('group', { name: ALCOHOL })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])

    await page.getByText('Show as a table').click()
    const table = page.getByRole('table', { name: ALCOHOL })
    await expect(table.getByRole('row')).toHaveCount(52)
    await expect(table.getByRole('row', { name: /^Montana/ })).toContainText(
      '100% (not yet reviewed)',
    )
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}

test('the tile map fits a 390 px phone without a horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/compare/map')
  const map = page.getByRole('group', { name: ALCOHOL })
  await expect(map).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  const box = await map.boundingBox()
  expect(box?.width ?? 0).toBeLessThanOrEqual(390 - 32)
})

test.describe('the tile map with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the default category is a table in the HTML', async ({ page }) => {
    await page.goto('/compare/map')
    const table = page.getByRole('table', { name: ALCOHOL })
    await expect(table.getByRole('row', { name: /^Montana/ })).toContainText(
      '100% (not yet reviewed)',
    )
    await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('test-alcohol-use')
  })
})
