import { expect, test } from '@playwright/test'

// The screen reader spot check as code (roadmap M8 step 2): what the accessibility tree offers
// on the main page types. A human still listens with NVDA and VoiceOver (docs/testing.md,
// "Manual screen reader check"). Data: e2e/fixtures/public-seed.sql.

const pages = [
  '/',
  '/states/mt',
  '/compare',
  '/compare/codes?states=MT,NE&category=sud',
  '/compare/states/ne-vs-mt',
  '/codes/icd-10-cm/F20.0',
  '/codes/hcpcs/E0465',
  '/search?q=paranoid',
]

for (const path of pages) {
  test(`${path}: landmarks, headings, tables and icons`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    // Landmarks: one banner with the main nav, one main, one footer.
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('banner').getByRole('navigation', { name: 'Main' })).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)

    const report = await page.evaluate(() => {
      const problems: string[] = []
      const shown = (el: Element) => {
        if (el.closest('[aria-hidden="true"]')) return false
        const s = getComputedStyle(el)
        return s.display !== 'none' && s.visibility !== 'hidden'
      }

      // The heading outline starts at h1 and never skips a level going down.
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(shown)
      let previous = 0
      for (const h of headings) {
        const level = Number(h.tagName.slice(1))
        if (level > previous + 1) {
          problems.push(`heading skips from h${String(previous)} to ${h.outerHTML.slice(0, 80)}`)
        }
        previous = level
      }

      // Tables: a caption or a label, and header cells with a scope.
      for (const table of Array.from(document.querySelectorAll('table')).filter(shown)) {
        const caption = table.querySelector('caption')?.textContent.trim() ?? ''
        if (
          !caption &&
          !table.getAttribute('aria-label') &&
          !table.getAttribute('aria-labelledby')
        ) {
          problems.push(`table without a name: ${table.outerHTML.slice(0, 80)}`)
        }
        for (const th of Array.from(table.querySelectorAll('th'))) {
          if (!th.getAttribute('scope'))
            problems.push(`th without scope: ${th.outerHTML.slice(0, 80)}`)
        }
      }

      // Icons: hidden from the tree, or a named graphic.
      for (const svg of Array.from(document.querySelectorAll('svg')).filter(shown)) {
        const named =
          svg.hasAttribute('aria-label') ||
          svg.hasAttribute('aria-labelledby') ||
          svg.querySelector(':scope > title') !== null
        if (!named) problems.push(`svg neither hidden nor named: ${svg.outerHTML.slice(0, 80)}`)
      }
      for (const img of Array.from(document.querySelectorAll('img'))) {
        if (!img.hasAttribute('alt'))
          problems.push(`img without alt: ${img.outerHTML.slice(0, 80)}`)
      }

      // Every control has a name.
      for (const el of Array.from(
        document.querySelectorAll('a[href], button, input, select, textarea'),
      ).filter(shown)) {
        // `labels` exists on form fields only.
        const input = el as Partial<HTMLInputElement>
        const labelled =
          el.hasAttribute('aria-label') ||
          el.hasAttribute('aria-labelledby') ||
          (input.labels?.length ?? 0) > 0 ||
          el.textContent.trim() !== '' ||
          input.type === 'hidden'
        if (!labelled) problems.push(`control without a name: ${el.outerHTML.slice(0, 80)}`)
      }
      return problems
    })
    expect(report).toEqual([])
  })
}

test('the qualification badges and status words carry text, not colour alone', async ({ page }) => {
  await page.goto('/compare/codes?states=MT,NE&category=sud')
  const row = page
    .getByRole('table', { name: 'Substance use disorder: codes by state' })
    .getByRole('row', { name: /F10\.20/ })
  await expect(row).toContainText('Listed')
  await expect(row).toContainText('Enough by itself')
})

test('search: the result count and loading are in a polite live region', async ({ page }) => {
  await page.goto('/search?q=paranoid')
  const status = page.getByRole('status').filter({ hasText: /found/ })
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toContainText(/1 code found/)
})
