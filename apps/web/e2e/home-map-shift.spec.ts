import { expect, type Page, test } from '@playwright/test'

// The home map must not move when the pointer crosses states (project lead, 2026-11-03).
//
// The bug: the card beside (or, on phones, below) the map showed only the active state, so its
// height changed with each hover. The page's height changed with it, the browser clamped or
// anchored the scroll, the map moved under the pointer, the pointer entered another state, and
// the page "bounced" at the frame rate. The fix stacks every state's card in one grid cell
// (invisible sizers), so the cell is always as tall as the tallest card.
//
// How this test works: it makes the cards as different as it can (one state with every code
// system and federal category plus both notes, one announced, one with no list), scrolls the
// map into view, records where the map is, hovers each state in turn and expects the map's box,
// the scroll position and the page height to stay exactly the same. If it fails, the message
// names the width, the scroll mode and the state that moved it; compare the "before" and
// "after" numbers. A changing page height means a card is taller than the sizers allow (is a
// state missing from the stack?); a stable height but a changing scrollY means scroll anchoring.

const MAP = 'Map of state medical frailty code lists'

// Large states, so the centre of each link's box is inside its own shape at 390 px.
const LIST = 'MT' // published in e2e/fixtures/public-seed.sql; given every count below
const ANNOUNCED = 'TX' // set to "announced" below
const NONE = 'CA' // no list

const names: Record<string, string> = { MT: 'Montana', TX: 'Texas', CA: 'California' }

interface Summary {
  id: string
  status: string
  published: null | {
    bySystem: Record<string, number>
    byFederalCategory: Record<string, number>
    mappingsConfirmed: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Rewrites the real `/api/public/states` answer so the three cards differ as much as possible. */
async function varyTheCards(page: Page) {
  await page.route('**/api/public/states', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { dataVersion: number; items: Summary[] }
    for (const s of body.items) {
      if (s.id === ANNOUNCED) {
        s.status = 'announced'
        s.published = null
      }
      if (s.id === NONE) {
        s.status = 'none'
        s.published = null
      }
      if (s.id === LIST && s.published) {
        // A row for every code system and federal category, an overlap note (the federal counts
        // add up to more than the entries) and the "not reviewed" note: the tallest card.
        for (const k of Object.keys(s.published.bySystem)) s.published.bySystem[k] = 1234
        for (const k of Object.keys(s.published.byFederalCategory)) {
          s.published.byFederalCategory[k] = 98765
        }
        s.published.mappingsConfirmed = false
      }
    }
    await route.fulfill({ response, json: body })
  })
}

interface Place {
  x: number
  y: number
  width: number
  height: number
  scrollY: number
  pageHeight: number
}

/** Where the map is, after two frames (so layout and any scroll clamp have happened). */
async function measure(page: Page): Promise<Place> {
  return page.evaluate(async (mapName) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const map = document.querySelector(`svg[role="group"]`)
    if (!map) throw new Error(`no map (${mapName})`)
    const box = map.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      scrollY: window.scrollY,
      pageHeight: document.documentElement.scrollHeight,
    }
  }, MAP)
}

const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]

for (const viewport of viewports) {
  // "end" puts the map's bottom at the viewport's bottom: on a short page that is the largest
  // scroll, where a shrinking page forces the browser to clamp scrollY (the bounce).
  for (const block of ['center', 'end'] as const) {
    test(`the map does not move when hovering states (${String(viewport.width)} px, ${block})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await varyTheCards(page)
      await page.goto('/')
      // Phones start on the table view; switch to the map.
      await page.getByRole('button', { name: 'Map' }).click()
      const map = page.getByRole('group', { name: MAP })
      await expect(map.getByRole('link')).toHaveCount(51)
      await map.evaluate((el, b) => {
        el.scrollIntoView({ block: b })
      }, block)

      const before = await measure(page)
      // Twice round, in an order that swaps the tallest and shortest cards each time.
      for (const id of [LIST, NONE, ANNOUNCED, LIST, ANNOUNCED, NONE]) {
        const name = names[id] ?? id
        await map.getByRole('link', { name: new RegExp(`^${name}:`) }).hover()
        // The hover worked: this state's card is the visible one.
        await expect(page.getByRole('region', { name })).toBeVisible()
        expect(await measure(page), `after hovering ${name}`).toEqual(before)
      }
    })
  }
}
