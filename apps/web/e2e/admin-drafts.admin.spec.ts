import { expect, type Page, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// Runs in the "admin" project (playwright.config.ts): store a file, read it, review it, send
// it to a draft and open the draft's checks, against a real Worker, D1 and R2. The local
// database is kept between runs, so each run uses a file no earlier run stored.

function csvFile() {
  const run = String(Date.now())
  return {
    name: `list-${run}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `Code,Description\nE09349,Drug induced diabetes (run ${run})\nF20.0,Paranoid schizophrenia\n`,
    ),
  }
}

/** Stores a new file for `state`, reads it, and sends it to a new draft. */
async function sendToDraft(page: Page, state: string) {
  const file = csvFile()
  await page.goto('/admin/sources')
  await page.getByLabel('State').selectOption(state)
  await page.getByLabel('File').setInputFiles(file)
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('status')).toContainText('Stored')

  await page.goto('/admin/ingest')
  await page.getByLabel('State').selectOption(state)
  await page.getByLabel('File', { exact: true }).setInputFiles(file)
  const panel = page.getByRole('region', { name: 'Send to a draft' })
  await expect(panel.getByLabel('Source document')).toHaveValue(/\d+/)
  await panel.getByRole('button', { name: 'Send to draft' }).click()
  await panel.getByRole('link', { name: /Open draft v\d+/ }).click()
  await expect(
    page.getByRole('heading', { name: new RegExp(`${state}: draft v\\d+`) }),
  ).toBeVisible()
}

// Montana is never published here, so its diff is always against nothing (the local
// database is kept between runs); the publish test uses Nebraska.
test('sends reviewed rows to a draft and shows its checks', async ({ page }) => {
  const errors = collectErrors(page)
  await sendToDraft(page, 'Montana')
  const sources = page.getByRole('table', { name: 'Source files in this draft' })
  await expect(sources.getByText('2 of 2')).toBeVisible()
  // This database has no reference codes, so both ICD-10-CM codes are "unknown".
  await expect(page.getByRole('list', { name: 'Needs a confirmation' })).toContainText(
    'not in the current CMS code set',
  )
  await expect(page.getByRole('table', { name: 'Changed codes' }).getByRole('row')).toHaveCount(3)
  expect(errors).toEqual([])
})

/** On a draft page: confirm everything the checks ask for, then publish. */
async function publish(page: Page) {
  const panel = page.getByRole('region', { name: 'Publish' })
  // The panel appears once the checks have run.
  await expect(panel.getByRole('button', { name: /Publish draft v\d+/ })).toBeVisible()
  for (const box of await panel.getByRole('checkbox').all()) await box.check()
  for (const input of await panel.getByRole('textbox').all()) await input.fill('NE')
  await panel.getByRole('button', { name: /Publish draft v\d+/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'public list' })).toContainText(
    'Nebraska’s public list',
  )
}

test('publishes two drafts and restores the first from Versions', async ({ page }) => {
  const errors = collectErrors(page)
  await sendToDraft(page, 'Nebraska')
  const first = /draft v(\d+)/.exec(
    (await page.getByRole('heading', { level: 2 }).textContent()) ?? '',
  )?.[1]
  await publish(page)
  await sendToDraft(page, 'Nebraska')
  await publish(page)

  await page.goto('/admin/versions')
  await page.getByLabel('State').selectOption('Nebraska')
  await page.getByRole('button', { name: `Restore v${first ?? ''}`, exact: true }).click()
  await page.getByRole('button', { name: `Yes, make v${first ?? ''} public again` }).click()
  await expect(page.getByRole('status')).toContainText(`v${first ?? ''} is public again`)
  const row = page.getByRole('row').filter({ hasText: 'Public now' })
  await expect(row).toContainText(`v${first ?? ''}`)
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on a draft (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await sendToDraft(page, 'Montana')
    await expect(page.getByRole('table', { name: 'Changed codes' })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}

test('maps a category and overrides a chapter', async ({ page }) => {
  const errors = collectErrors(page)
  await sendToDraft(page, 'Montana')
  await page.goto('/admin/categories')
  await page.getByLabel('State').selectOption('Montana')
  const table = page.getByRole('table', { name: 'Categories of Montana' })
  // The database is kept between runs: the first run previews the change (M7 step 3), a later
  // one finds it stored and confirms at once.
  await table.getByLabel('Federal category for (no category)').selectOption('state_specific')
  const preview = page.getByRole('region', { name: 'Check the remap before saving' })
  const change = table.getByRole('button', { name: 'Preview change for (no category)' })
  if (await change.isVisible()) {
    await change.click()
    await preview.getByRole('button', { name: 'Save remap' }).click()
    await expect(page.getByRole('status')).toContainText('Remapped 1 item in Montana.')
  } else {
    await table.getByRole('button', { name: 'Confirm (no category)' }).click()
    await expect(page.getByRole('status')).toContainText('Confirmed (no category)')
  }
  await expect(table.getByText(/Confirmed by e2e-admin@localhost/)).toBeVisible()

  const chapters = page.getByRole('table', { name: 'ICD-10-CM chapters' })
  await chapters.getByLabel('Override for chapter 5').selectOption('disabling_mental_disorder')
  const chapterButton = chapters.getByRole('button', { name: 'Preview change for chapter 5' })
  if (await chapterButton.isEnabled()) {
    await chapterButton.click()
    await expect(preview).toContainText('ICD-10-CM chapter 5')
    await preview.getByRole('button', { name: 'Save remap' }).click()
    await expect(page.getByRole('status')).toContainText('Remapped 1 item in Montana.')
  }
  expect(await seriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})
