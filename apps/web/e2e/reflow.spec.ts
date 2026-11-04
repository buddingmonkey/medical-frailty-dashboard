import { expect, test } from '@playwright/test'

// Reflow (WCAG 1.4.10; roadmap M8 step 2): at 320 CSS px wide (1280 px at 400% zoom) and at
// 640 px (200% zoom) no public page scrolls sideways. Wide data tables scroll inside their own
// box, which the rule allows. Motion: with reduced motion asked for, nothing animates.

const paths = [
  '/',
  '/states',
  '/states/mt',
  '/states/al',
  '/compare',
  '/compare/categories',
  '/compare/map?category=test-psychoses',
  '/compare/states',
  '/compare/codes?states=MT,NE&category=sud',
  '/compare/test-psychoses',
  '/compare/states/ne-vs-mt',
  '/search?q=paranoid',
  '/codes/icd-10-cm/F20.0',
  '/codes/hcpcs/E0465',
  '/about',
  '/disclaimer',
  '/privacy',
  '/accessibility',
  '/no-such-page',
]

for (const width of [320, 640]) {
  test.describe(`${String(width)} px wide`, () => {
    test.use({ viewport: { width, height: 800 } })
    for (const path of paths) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          if (doc.scrollWidth <= doc.clientWidth) return null
          // Name the widest element that is not inside a scrolling box, to find the cause.
          const culprit = Array.from(document.querySelectorAll('body *')).find((el) => {
            const r = el.getBoundingClientRect()
            if (r.right <= doc.clientWidth + 1) return false
            for (let p = el.parentElement; p; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX
              if (o === 'auto' || o === 'scroll' || o === 'hidden') return false
            }
            return true
          })
          return `${String(doc.scrollWidth)} > ${String(doc.clientWidth)}: ${culprit?.outerHTML.slice(0, 120) ?? '?'}`
        })
        expect(overflow).toBeNull()
      })
    }
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('no element animates or transitions', async ({ page }) => {
    for (const path of ['/', '/compare', '/compare/map?category=test-psychoses', '/search']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const moving = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .filter((el) => {
            const s = getComputedStyle(el)
            const transition = s.transitionDuration.split(',').some((d) => parseFloat(d) > 0.01)
            const animation =
              s.animationName !== 'none' &&
              s.animationDuration.split(',').some((d) => parseFloat(d) > 0.01)
            return transition || animation
          })
          .map((el) => el.outerHTML.slice(0, 100)),
      )
      expect(moving, path).toEqual([])
    }
  })
})
