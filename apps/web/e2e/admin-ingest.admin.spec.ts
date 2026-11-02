import { expect, test } from '@playwright/test'

import { makePdf } from '../src/ingest/fixtures/make-pdf'
import { collectErrors, seriousA11yViolations } from './helpers'

// Runs in the "admin" project: a local Worker with the development admin bypass
// (playwright.config.ts). Reads a PDF in a real browser: our parser worker starts pdf.js's own
// worker, under the site's real CSP.

const pdf = makePdf([
  [
    { text: 'Code', x: 40, y: 50, bold: true },
    { text: 'Code Name', x: 120, y: 50, bold: true },
    { text: 'F20.0', x: 40, y: 70 },
    { text: 'Paranoid schizophrenia', x: 120, y: 70 },
    { text: 'with a second line', x: 120, y: 82 },
    { text: 'F20.1', x: 40, y: 104 },
    { text: 'Disorganized schizophrenia', x: 120, y: 104 },
  ],
])

test('reads a PDF in the browser and maps its rows', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/admin/ingest')
  await page.getByLabel('State').selectOption('Montana')
  await page.getByLabel('File').setInputFiles({
    name: 'mt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  })

  const rows = page.getByRole('table', { name: 'Mapped rows (first 20)' })
  await expect(rows.getByText('Paranoid schizophrenia with a second line')).toBeVisible()
  await expect(page.getByLabel('Wrapped lines')).toHaveValue('auto')

  await page.getByLabel('Wrapped lines').selectOption('above')
  await expect(rows.getByText('with a second line Disorganized schizophrenia')).toBeVisible()
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems with a PDF read (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/admin/ingest')
    await page.getByLabel('State').selectOption('Montana')
    await page.getByLabel('File').setInputFiles({
      name: 'mt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
    })
    await expect(page.getByRole('table', { name: 'Mapped rows (first 20)' })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}
