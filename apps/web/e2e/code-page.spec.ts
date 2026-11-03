import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Server-rendered code pages (roadmap M6 step 5; docs/seo.md). The e2e database has no CMS
// reference codes, so F20.0 carries only Montana's own text (e2e/fixtures/public-seed.sql):
// Montana lists it (Enough by itself, stated), Nebraska has a list without it.

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('a code page answers per state, with sources, dates and a DefinedTerm', async ({ page }) => {
    const res = await page.goto('/codes/icd-10-cm/F20.0')
    expect(res?.status()).toBe(200)

    await expect(page).toHaveTitle(
      'ICD-10-CM F20.0: medical frailty status in 2 states | Medical Frailty Coding Dashboard',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('F20.0')
    const summary = page.getByRole('region', { name: 'Summary' })
    await expect(summary).toContainText('1 of 2 states with a list on this site include F20.0.')
    await expect(
      summary.getByText('Montana’s list includes F20.0. State’s rule: Enough by itself.'),
    ).toBeVisible()
    await expect(summary.getByText('Nebraska’s list does not include F20.0.')).toBeVisible()
    await expect(summary).toContainText('Last updated on this site November 2, 2026.')

    const table = page.getByRole('table', { name: 'Listed' })
    const row = table.getByRole('row', { name: /Montana/ })
    await expect(row).toContainText('Paranoid schizophrenia')
    await expect(row).toContainText('September 29, 2026')
    await expect(row).toContainText('page 6')
    await expect(
      row.getByRole('link', { name: 'DPHHS Medically Frail Condition List' }),
    ).toHaveAttribute('href', /^https:\/\/dphhs\.mt\.gov\//)

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/codes\/icd-10-cm\/F20\.0$/,
    )
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const ld = await page.locator('script[type="application/ld+json"]').textContent()
    expect(JSON.parse(ld ?? '{}')).toMatchObject({
      '@type': 'WebPage',
      dateModified: '2026-11-02T12:00:00.000Z',
      mainEntity: {
        '@type': 'DefinedTerm',
        termCode: 'F20.0',
        name: 'Paranoid schizophrenia',
        disambiguatingDescription: 'As published by Montana (DPHHS Medically Frail Condition List)',
        inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'ICD-10-CM' },
      },
    })
  })

  test('another spelling redirects; an unknown code is a 404 page, never indexed', async ({
    page,
    request,
  }) => {
    const moved = await request.get('/codes/icd-10-cm/f200', { maxRedirects: 0 })
    expect(moved.status()).toBe(301)
    expect(moved.headers()['location']).toBe('/codes/icd-10-cm/F20.0')

    const res = await page.goto('/codes/icd-10-cm/Z99.99')
    expect(res?.status()).toBe(404)
    expect(res?.headers()['x-robots-tag']).toBe('noindex')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code not found')
  })
})

test('the sitemap lists the included codes in their own file', async ({ request }) => {
  const index = await (await request.get('/sitemap.xml')).text()
  expect(index).toContain('/sitemaps/pages.xml</loc>')
  expect(index).toContain('/sitemaps/codes-1.xml</loc>')
  const codes = await (await request.get('/sitemaps/codes-1.xml')).text()
  expect(codes).toContain('/codes/icd-10-cm/F20.0</loc><lastmod>2026-11-02</lastmod>')
  expect(codes).toContain('/codes/icd-10-cm/J44.9</loc>')

  const search = await request.get('/search')
  expect(search.headers()['x-robots-tag']).toBe('noindex')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the code page with JavaScript: same answer, no errors, axe clean (${theme})`, async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/codes/icd-10-cm/F20.0')

    await expect(
      page.getByRole('heading', { level: 2, name: 'Included', exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('region', { name: 'Summary' })
        .getByText('Montana’s list includes F20.0. State’s rule: Enough by itself.'),
    ).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
    expect(errors).toEqual([])
  })
}
