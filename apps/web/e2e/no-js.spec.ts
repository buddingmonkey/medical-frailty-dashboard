import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Server-rendered pages (roadmap M3 step 4; docs/seo.md): what a crawler that does not run
// JavaScript sees. Montana's small list comes from e2e/fixtures/public-seed.sql.

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test("a state page carries the state's key facts", async ({ page }) => {
    await page.goto('/states/mt')

    await expect(page).toHaveTitle(
      'Montana medical frailty codes | Medical Frailty Coding Dashboard',
    )
    await expect(page.getByRole('heading', { level: 1, name: 'Montana' })).toBeVisible()
    await expect(
      page.getByText(
        'Montana’s medical frailty code list on this site has 3 entries (version 1), from the ' +
          'state’s document dated September 29, 2026.',
      ),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Entries by the state’s rule on whether a code is enough by itself: Enough by itself, 2; State doesn’t say, 1.',
      ),
    ).toBeVisible()
    const categories = page.getByRole('table', { name: 'Montana’s categories' })
    await expect(
      categories.getByRole('row', { name: /SMI Disabling mental disorder 1 Reviewed/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'DPHHS Medically Frail Condition List' }),
    ).toHaveAttribute('href', /^https:\/\/dphhs\.mt\.gov\//)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/states\/mt$/)
    const ld = await page.locator('script[type="application/ld+json"]').textContent()
    expect(JSON.parse(ld ?? '{}')).toMatchObject({
      '@type': 'Dataset',
      name: 'Montana medical frailty codes',
    })
  })

  test('the home page lists every state', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Compare medical frailty codes by state',
    )
    const table = page.getByRole('table', { name: 'State medical frailty code lists' })
    await expect(table.getByRole('row')).toHaveCount(52)
    await expect(table.getByRole('row', { name: /^Montana List on this site 3/ })).toBeVisible()
  })

  test('the single-code comparison works as a plain form', async ({ page }) => {
    await page.goto('/compare/codes')

    await page.getByLabel('Federal category').selectOption('sud')
    // Checked out of order; the URL comes back as one parameter, alphabetical by name.
    await page.getByRole('checkbox', { name: 'Nebraska' }).check()
    await page.getByRole('checkbox', { name: 'Montana' }).check()
    await page.getByRole('button', { name: 'Show the table' }).click()

    await expect(page).toHaveURL(/\/compare\/codes\?states=MT,NE&category=sud$/)
    const table = page.getByRole('table', { name: 'Substance use disorder: codes by state' })
    await expect(table.getByRole('columnheader')).toHaveText([
      'Code',
      'Description',
      'Montana',
      'Nebraska',
    ])
    await expect(page.getByRole('checkbox', { name: 'Montana' })).toBeChecked()
    await expect(page.getByLabel('Federal category')).toHaveValue('sud')
  })
})

test('the state page with JavaScript: same facts, no console or CSP errors, axe clean', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/states/mt')

  await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('3')
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('downloads and the sitemap', async ({ request }) => {
  const csv = await request.get('/states/mt/codes.csv')
  expect(csv.headers()['content-disposition']).toContain('mt-medical-frailty-codes-v1.csv')
  const lines = (await csv.text()).trimEnd().split('\r\n')
  expect(lines).toHaveLength(4)
  expect(lines.find((l) => l.includes('F20.0'))).toContain('Disabling mental disorder')

  const sitemap = await (await request.get('/sitemaps/pages.xml')).text()
  expect(sitemap).toContain('/states/mt</loc><lastmod>2026-11-02</lastmod>')
})
