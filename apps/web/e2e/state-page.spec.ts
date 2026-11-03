import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// State pages (roadmap M3 step 3). The e2e database has the 50 states and DC but no lists.

test('a state on the map opens its page', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await page
    .getByRole('group', { name: 'Map of state medical frailty code lists' })
    .getByRole('link', { name: /^Alabama:/ })
    .click()

  await expect(page).toHaveURL(/\/states\/al$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alabama' })).toBeVisible()
  await expect(
    page.getByText('This site knows of no published medical frailty code list for Alabama.'),
  ).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('an unknown state shows a not-found page', async ({ page }) => {
  await page.goto('/states/zz')
  await expect(page.getByRole('heading', { level: 1, name: 'State not found' })).toBeVisible()
})
