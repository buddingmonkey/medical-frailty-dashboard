import { expect, test } from '@playwright/test'

import { collectErrors, seriousA11yViolations } from './helpers'

// About/methodology, disclaimer, privacy and accessibility (roadmap M8 step 4): each page opens,
// passes axe in both themes, and every footer link on it resolves.

const pages = [
  { path: '/about', heading: 'About and methodology' },
  { path: '/disclaimer', heading: 'Disclaimer' },
  { path: '/privacy', heading: 'Privacy' },
  { path: '/accessibility', heading: 'Accessibility' },
] as const

for (const info of pages) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${info.path} opens, is accessible and its footer links resolve (${theme})`, async ({
      page,
      request,
    }) => {
      const errors = collectErrors(page)
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(info.path)
      await expect(page.getByRole('heading', { level: 1, name: info.heading })).toBeVisible()
      expect(await seriousA11yViolations(page)).toEqual([])

      const footerNav = page
        .getByRole('contentinfo')
        .getByRole('navigation', { name: 'About this site' })
      const links = footerNav.getByRole('link')
      await expect(links).toHaveCount(6)
      for (const href of await links.evaluateAll((els) =>
        els.map((el) => el.getAttribute('href') ?? ''),
      )) {
        // Pages on this site must answer 200; GitHub links are checked by shape only (no
        // network calls to other hosts from the tests).
        if (href.startsWith('/')) {
          expect((await request.get(href)).status(), href).toBe(200)
        } else {
          expect(href).toMatch(
            /^https:\/\/github\.com\/buddingmonkey\/medical-frailty-dashboard(\/issues\/new\?template=data-error\.yml)?$/,
          )
        }
      }
      await expect(page.getByRole('contentinfo')).toContainText('Data last updated')
      expect(errors).toEqual([])
    })
  }
}

test('a learn-more link opens About at its section', async ({ page }) => {
  await page.goto('/compare')
  await page.getByRole('link', { name: 'How these numbers are worked out' }).click()
  await expect(page).toHaveURL(/\/about#coverage$/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'How the overview’s numbers are worked out' }),
  ).toBeInViewport()
})
