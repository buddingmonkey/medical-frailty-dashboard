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
    // A bare category: the review asks whether it covers the whole category.
    { text: 'F31', x: 40, y: 126 },
    { text: 'Bipolar disorder', x: 120, y: 126 },
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

  const review = page.getByRole('region', { name: 'Review rows' })
  await expect(review.getByText('3 rows: 2 ready, 1 needs a decision')).toBeVisible()
  await review.getByRole('button', { name: 'Whole category', exact: true }).click()
  await expect(review.getByText('3 rows: 3 ready')).toBeVisible()
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
    // The review table with a flag and its buttons, and an open inline edit form.
    const review = page.getByRole('table', { name: 'Rows to review' })
    await review.getByRole('button', { name: /^Edit row/ }).click()
    await expect(page.getByRole('group', { name: /^Edit row/ })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}

test('builds an AI prompt from a PDF and reads the pasted answer', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/admin/ingest')
  await page.getByLabel('State').selectOption('Montana')
  await page.getByLabel('File').setInputFiles({
    name: 'mt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  })
  const panel = page.getByRole('region', { name: 'Get help from an AI assistant' })
  await panel.getByRole('button', { name: 'Prepare the prompt' }).click()
  // The text comes from pdf.js in the parser worker, one line per printed line.
  await expect(panel.getByLabel('Prompt for part 1')).toHaveValue(
    /F20\.0 {3}Paranoid schizophrenia/,
  )
  // No API key on this Worker: the Claude button is there but disabled, with a tooltip.
  await expect(panel.getByRole('button', { name: /Ask Claude/ })).toBeDisabled()
  await expect(panel.getByRole('tooltip')).toHaveText(/needs an Anthropic API key/)

  await panel
    .getByLabel('The assistant’s answer')
    .fill('{"rows":[{"code":"F31.0","description":"Bipolar"}]}')
  await panel.getByRole('button', { name: 'Read the answer' }).click()
  await expect(panel.getByRole('status')).toContainText('Read 1 row')
  await expect(page.getByLabel('Table', { exact: true })).toHaveValue('1')
  await expect(page.getByRole('table', { name: 'Mapped rows (first 20)' })).toContainText('Bipolar')
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the guide renders with no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/admin/guide')
    await expect(page.getByRole('heading', { name: /Adding or updating a state/ })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}
