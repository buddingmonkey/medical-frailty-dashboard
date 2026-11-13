import { expect, type Locator, type Page, test } from '@playwright/test'

import { collectErrors } from './helpers'

// Keyboard-only use (roadmap M8 step 2): the skip link, focus after a route change, visible
// focus in both themes, no traps, menus that close on Escape, and the usability tasks of M8
// step 5 done with the keyboard alone. Data: e2e/fixtures/public-seed.sql.

async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el === document.activeElement).catch(() => false)
}

/** Presses Tab until `target` has focus; fails after `max` presses. */
async function tabTo(page: Page, target: Locator, max = 150) {
  for (let i = 0; i < max; i++) {
    if (await isFocused(target)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    return el ? `${el.tagName.toLowerCase()} ${el.textContent.trim().slice(0, 40)}` : ''
  })

test('the skip link is the first stop, shows on focus and moves focus to main', async ({
  page,
}) => {
  await page.goto('/states/mt')
  await expect(page.getByRole('heading', { level: 1, name: 'Montana' })).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  const box = await skip.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(20)

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement)),
  ).toBe(true)
})

test('a route change moves focus to the new page’s heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await tabTo(page, nav.getByRole('link', { name: 'States' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'All states' })).toBeFocused()

  // A page whose heading arrives with its data.
  await tabTo(
    page,
    page.getByRole('table', { name: 'State medical frailty code lists' }).getByRole('link', {
      name: 'Montana',
    }),
  )
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Montana' })).toBeFocused()

  // The next Tab goes on from the heading, not from the top of the page.
  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement)),
  ).toBe(true)
})

test('a filter change in the URL leaves focus where it is', async ({ page }) => {
  await page.goto('/compare/codes?states=MT&category=sud')
  await expect(page.getByRole('table', { name: /codes by state/ })).toBeVisible()
  // The state picker starts closed once states are chosen; Enter on its summary opens it.
  await page.getByText('States to compare:').focus()
  await page.keyboard.press('Enter')
  const nebraska = page.getByRole('group', { name: 'States' }).getByRole('checkbox', {
    name: 'Nebraska',
  })
  await nebraska.focus()
  await page.keyboard.press('Space')
  await expect(page).toHaveURL(/states=MT(%2C|,)NE/)
  await expect(nebraska).toBeFocused()
})

test('no positive tabindex anywhere, so the Tab order is the reading order', async ({ page }) => {
  for (const path of ['/', '/states/mt', '/compare', '/compare/map', '/search?q=paranoid']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const positive = await page
      .locator('[tabindex]')
      .evaluateAll((els) => els.filter((el) => Number(el.getAttribute('tabindex')) > 0).length)
    expect(positive, path).toBe(0)
  }
})

/**
 * Tabs through the whole page and checks that every stop has a visible focus indicator: an
 * outline, or (the maps) a focus style drawn by a parent or an outline layer. Returns the number
 * of stops; fails on a trap (focus that stops moving before the end of the page).
 */
async function walkFocus(page: Page, max: number): Promise<number> {
  const seen: string[] = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const path: string[] = []
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        path.unshift(
          `${n.tagName}:${String(Array.from(n.parentElement?.children ?? []).indexOf(n))}`,
        )
      }
      const visible = (node: Element) => {
        const s = getComputedStyle(node)
        return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
      }
      const indicator =
        visible(el) ||
        // The tile map: the tile around the link draws the ring.
        (el.parentElement !== null && visible(el.parentElement)) ||
        // The US map: a gold outline layer is drawn over the focused state.
        (el.closest('svg')?.querySelector('g[aria-hidden="true"] path') ?? null) !== null
      return { key: path.join('/'), indicator, label: el.outerHTML.slice(0, 120) }
    })
    if (info === null) return seen.length // back past the end of the page
    expect(info.indicator, `no visible focus on ${info.label}`).toBe(true)
    if (seen.at(-1) === info.key) throw new Error(`focus is stuck on ${info.label}`)
    if (seen.includes(info.key)) return seen.length // wrapped around to the start
    seen.push(info.key)
  }
  throw new Error(`more than ${String(max)} Tab stops; last: ${await focusedName(page)}`)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`focus is visible and never trapped (${theme})`, () => {
    test.use({ colorScheme: theme })
    for (const path of [
      '/',
      '/states/mt',
      '/compare',
      '/compare/map?category=test-psychoses',
      '/compare/codes?states=MT,NE&category=sud',
      '/compare/states/ne-vs-mt',
      '/compare/test-psychoses',
      '/search?q=paranoid',
      '/codes/hcpcs/E0465',
      '/about',
    ]) {
      test(path, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await walkFocus(page, 400)).toBeGreaterThan(5)
      })
    }
  })
}

test('menus close on Escape and give focus back to their button', async ({ page }) => {
  await page.goto('/')
  const theme = page.getByRole('button', { name: /^Theme:/ })
  await theme.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeHidden()
  await expect(theme).toBeFocused()

  await page.setViewportSize({ width: 390, height: 800 })
  const menu = page.getByRole('button', { name: 'Menu' })
  await menu.focus()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link').first(),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeFocused()
})

test('the overview’s sort controls are buttons in headers with aria-sort', async ({ page }) => {
  await page.goto('/compare')
  const table = page.getByRole('table').first()
  // Only the sorted column carries aria-sort (ARIA: one at a time).
  const overall = table.getByRole('columnheader', { name: /Overall/ })
  const sort = overall.getByRole('button')
  await sort.focus()
  await page.keyboard.press('Enter')
  await expect(overall).toHaveAttribute('aria-sort', /^(ascending|descending)$/)
  const first = await overall.getAttribute('aria-sort')
  await page.keyboard.press('Enter')
  await expect(overall).toHaveAttribute('aria-sort', /^(ascending|descending)$/)
  await expect(overall).not.toHaveAttribute('aria-sort', first ?? '')
  await expect(table.locator('th[aria-sort]')).toHaveCount(1)
})

test.describe('the usability tasks with the keyboard only', () => {
  test('1. how many codes Montana lists and when its list was updated', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const map = page.getByRole('group', { name: 'Map of state medical frailty code lists' })
    await tabTo(page, map.getByRole('link', { name: /^Montana:/ }))
    await expect(page.getByRole('region', { name: 'Montana' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Montana' })).toBeFocused()
    const summary = page.getByRole('region', { name: 'Summary' })
    await expect(summary).toContainText('Entries in the state’s list')
    await expect(summary).toContainText('3')
    await expect(summary).toContainText('updated November 2, 2026')
    expect(errors).toEqual([])
  })

  test('2. compare the SUD codes of two states', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await tabTo(page, nav.getByRole('link', { name: 'Compare' }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await tabTo(
      page,
      page.getByRole('navigation', { name: 'Compare views' }).getByRole('link', {
        name: 'Single codes',
      }),
    )
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Compare single codes' }),
    ).toBeFocused()

    const category = page.getByLabel('Federal category', { exact: true })
    await tabTo(page, category)
    // Typing picks an option in a focused select, as a keyboard user would.
    await page.keyboard.type('Substance')
    await expect(category).toHaveValue('sud')
    const states = page.getByRole('group', { name: 'States' })
    for (const name of ['Montana', 'Nebraska']) {
      await tabTo(page, states.getByRole('checkbox', { name }))
      await page.keyboard.press('Space')
    }
    const table = page.getByRole('table', { name: 'Substance use disorder: codes by state' })
    await expect(table.getByRole('row', { name: /F10\.20/ })).toContainText('Listed')
  })

  test('the compare state picker: presets, filter and checkboxes with Tab and Space', async ({
    page,
  }) => {
    await page.goto('/compare/codes')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Compare single codes' }),
    ).toBeVisible()
    const category = page.getByLabel('Federal category', { exact: true })
    await tabTo(page, category)
    await page.keyboard.type('Substance')
    await expect(category).toHaveValue('sud')

    // Open while nothing is chosen: the presets come first.
    await tabTo(page, page.getByRole('button', { name: 'All states with a list' }))
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/states=MT,NE&category=sud/)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Clear' })).toBeFocused()
    await page.keyboard.press('Space')

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Filter states')).toBeFocused()
    await page.keyboard.type('neb')
    await expect(page.getByText('1 state shown')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('checkbox', { name: 'Nebraska' })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/states=NE&category=sud/)
    await expect(page.getByRole('checkbox', { name: 'Nebraska' })).toBeFocused()
  })

  test('3. whether F20.0 qualifies in Louisiana, and which other states list it', async ({
    page,
  }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await tabTo(page, nav.getByRole('link', { name: 'Search' }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Search codes' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('searchbox', { name: 'Code number or words' })).toBeFocused()
    await page.keyboard.type('F20.0')
    const results = page.getByRole('list', { name: 'Search results' })
    const link = results.getByRole('link', { name: 'F20.0' })
    await expect(link).toBeVisible()
    await tabTo(page, link)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    const summary = page.getByRole('region', { name: 'Summary' })
    // The e2e data has no Louisiana list: the page says which states with a list include it.
    await expect(summary).toContainText('Montana’s list includes F20.0.')
    await expect(summary).toContainText('Nebraska’s list does not include F20.0.')
  })

  test('4. an exact match and a "like" code are told apart', async ({ page }) => {
    await page.goto('/search')
    await tabTo(page, page.getByRole('searchbox', { name: 'Code number or words' }))
    await page.keyboard.type('E0465')
    const link = page.getByRole('list', { name: 'Search results' }).getByRole('link', {
      name: 'E0465',
    })
    await tabTo(page, link)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    const like = page.getByRole('region', { name: /like/i })
    await expect(like.getByRole('table')).toContainText('Z99.11')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Included', exact: true }),
    ).toHaveCount(0)
  })
})
