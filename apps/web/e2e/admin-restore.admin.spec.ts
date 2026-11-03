import { expect, type Page, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { readFile } from 'node:fs/promises'

import { collectErrors, seriousA11yViolations } from './helpers'

// Restore path 2 (docs/deployment.md, "Backups and restore"), in the "admin" project
// (playwright.config.ts) against a real Worker, D1 and R2:
//   1. a per-publish backup (format 1, made here) of a Kansas list the database never had is
//      imported → new draft → checks → publish → the public state page shows its entries;
//   2. the full download (zip) is taken from the page, and Kansas's version is imported from it
//      again, the same way.
// Kansas is used by no other spec, and the admin database is kept between runs, so every run
// writes its own descriptions (run id) and looks only for those. The source's SHA-256 is new each
// run, so step 1 stores it without a file and step 2 reuses it.

const STATE = 'Kansas'
const STATE_ID = 'KS'

/** A format 1 backup, as apps/api/src/db/backup.ts writes it before a publish. */
function versionBackup(run: string) {
  // A new hash each run (`run` is digits), so the first import stores a metadata-only source.
  const sha256 = run.padStart(64, '0')
  const entry = (id: number, rawCode: string, codeNorm: string) => ({
    id,
    versionId: 1,
    codeSystem: 'icd10cm',
    rawCode,
    codeNorm,
    matchKind: 'exact',
    rangeEndNorm: null,
    includesChildren: 0,
    descriptionPublished: `${rawCode} restored in e2e run ${run}`,
    stateCategory: 'Behavioral Health',
    stateSubcategory: '',
    tier: null,
    attributesJson: '{"included":true,"flags":[]}',
    qualification: 'standalone',
    qualificationBasis: 'published',
    sourceDocumentId: 1,
    sourceLocator: `row ${String(id)}`,
    sourcePart: 'Table 1',
  })
  return {
    format: 1,
    writtenAt: new Date().toISOString(),
    version: {
      id: 1,
      stateId: STATE_ID,
      versionNo: 1,
      status: 'published',
      label: null,
      effectiveDate: null,
      statePublishedDate: '2026-09-01',
      publishedAt: '2026-10-01T00:00:00.000Z',
    },
    sources: [
      {
        id: 1,
        stateId: STATE_ID,
        title: `Kansas list (e2e ${run})`,
        url: 'https://example.gov/kansas-frailty.pdf',
        publisherDate: '2026-09-01',
        sha256,
        fileType: 'pdf',
        byteSize: 1234,
      },
    ],
    parts: [],
    entries: [entry(1, 'F20.0', 'F200'), entry(2, 'N18.6', 'N186')],
  }
}

/** Picks `file` on /admin/restore and creates the draft; returns on the new draft's page. */
async function importToDraft(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/admin/restore')
  await page.getByLabel('Backup file').setInputFiles(file)
  await expect(page.getByRole('region', { name: /What is in/ })).toBeVisible()
  await page.getByLabel('State').selectOption(STATE_ID)
  await page.getByRole('button', { name: /Create draft from v\d+/ }).click()
  await expect(page.getByText(/Draft v\d+ holds \d+ restored entries/)).toBeVisible()
  await page.getByRole('link', { name: /Open draft v\d+/ }).click()
  await expect(
    page.getByRole('heading', { name: new RegExp(`${STATE}: draft v\\d+`) }),
  ).toBeVisible()
}

/** On a draft page: confirm everything the checks ask for, then publish (as admin-drafts). */
async function publish(page: Page) {
  const panel = page.getByRole('region', { name: 'Publish' })
  await expect(panel.getByRole('button', { name: /Publish draft v\d+/ })).toBeVisible()
  for (const box of await panel.getByRole('checkbox').all()) await box.check()
  for (const input of await panel.getByRole('textbox').all()) await input.fill(STATE_ID)
  await panel.getByRole('button', { name: /Publish draft v\d+/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'public list' })).toContainText(
    `${STATE}’s public list`,
  )
}

async function expectPublicEntries(page: Page, run: string) {
  await page.goto(`/states/${STATE_ID.toLowerCase()}`)
  await expect(page.getByText(`F20.0 restored in e2e run ${run}`)).toBeVisible()
  await expect(page.getByText(`N18.6 restored in e2e run ${run}`)).toBeVisible()
  // The citation renders from the metadata-only source.
  await expect(page.getByText(`Kansas list (e2e ${run})`).first()).toBeVisible()
}

test('restore path 2: a per-publish backup, then the full download, back to the public page', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const errors = collectErrors(page)
  const run = String(Date.now())

  // 1. Format 1 .json → draft → checks → publish.
  await importToDraft(page, {
    name: `${STATE_ID}-1.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(versionBackup(run))),
  })
  await publish(page)
  await expectPublicEntries(page, run)

  // 2. The full download: a zip with one JSON file that holds the list just published.
  await page.goto('/admin/restore')
  const downloading = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download backup' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^frailty-backup-development-\d{8}T\d{6}Z\.zip$/)
  const zip = await readFile(await download.path())
  const files = unzipSync(new Uint8Array(zip))
  expect(Object.keys(files)).toEqual([download.suggestedFilename().replace('.zip', '.json')])
  const json = new TextDecoder().decode(Object.values(files)[0])
  expect(json).toContain(`restored in e2e run ${run}`)
  expect(json).not.toContain('"ref_codes":[')

  await importToDraft(page, {
    name: download.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: zip,
  })
  await publish(page)
  await expectPublicEntries(page, run)
  expect(errors).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on Backup and restore (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/admin/restore')
    await page.getByLabel('Backup file').setInputFiles({
      name: 'ks.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(versionBackup(String(Date.now())))),
    })
    await page.getByLabel('State').selectOption(STATE_ID)
    await expect(page.getByRole('button', { name: /Create draft from v\d+/ })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])
  })
}
