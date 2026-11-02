import { expect, type Page, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Runs in the "admin" project (playwright.config.ts): store a file, read it, review it, send
// it to a draft and open the draft's checks, against a real Worker, D1 and R2. The local
// database is kept between runs, so each run uses a file no earlier run stored.

function csvFile() {
  const run = String(Date.now())
  return {
    name: `ne-${run}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `Code,Description\nE09349,Drug induced diabetes (run ${run})\nF20.0,Paranoid schizophrenia\n`,
    ),
  }
}

async function sendToDraft(page: Page) {
  const file = csvFile()
  await page.goto('/admin/sources')
  await page.getByLabel('State').selectOption('Nebraska')
  await page.getByLabel('File').setInputFiles(file)
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('status')).toContainText('Stored')

  await page.goto('/admin/ingest')
  await page.getByLabel('State').selectOption('Nebraska')
  await page.getByLabel('File', { exact: true }).setInputFiles(file)
  const panel = page.getByRole('region', { name: 'Send to a draft' })
  await expect(panel.getByLabel('Source document')).toHaveValue(/\d+/)
  await panel.getByRole('button', { name: 'Send to draft' }).click()
  await panel.getByRole('link', { name: /Open draft v\d+/ }).click()
  await expect(page.getByRole('heading', { name: /Nebraska: draft v\d+/ })).toBeVisible()
}

test('sends reviewed rows to a draft and shows its checks', async ({ page }) => {
  const errors = collectErrors(page)
  await sendToDraft(page)
  const sources = page.getByRole('table', { name: 'Source files in this draft' })
  await expect(sources.getByText('2 of 2')).toBeVisible()
  // This database has no reference codes, so both ICD-10-CM codes are "unknown".
  await expect(page.getByRole('list', { name: 'Needs a confirmation' })).toContainText(
    'not in the current CMS code set',
  )
  await expect(page.getByRole('table', { name: 'Changed codes' }).getByRole('row')).toHaveCount(3)
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on a draft (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await sendToDraft(page)
    await expect(page.getByRole('table', { name: 'Changed codes' })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}
