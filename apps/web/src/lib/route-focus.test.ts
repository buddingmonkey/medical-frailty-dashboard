import { afterEach, describe, expect, it } from 'vitest'

import { focusHeadingWhenReady } from './route-focus'

// Focus after a route change (roadmap M8 step 2). The router wiring is covered by
// e2e/keyboard.spec.ts; this covers the waiting and the "user already moved on" rule.

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusHeadingWhenReady', () => {
  it('focuses the h1 in main and makes it focusable from script only', () => {
    document.body.innerHTML = '<main id="main"><h1>Montana</h1></main>'
    focusHeadingWhenReady()
    const h1 = document.querySelector('h1')
    expect(document.activeElement).toBe(h1)
    expect(h1?.getAttribute('tabindex')).toBe('-1')
  })

  it('waits for a heading that arrives with the data', async () => {
    document.body.innerHTML = '<main id="main"><p>Loading…</p></main>'
    focusHeadingWhenReady()
    expect(document.activeElement).toBe(document.body)

    const h1 = document.createElement('h1')
    h1.textContent = 'Montana'
    document.getElementById('main')?.append(h1)
    await Promise.resolve()
    expect(document.activeElement).toBe(h1)
  })

  it('leaves focus alone once the user has moved into the new page', async () => {
    document.body.innerHTML = '<main id="main"><p>Loading…</p><a href="/x">Link</a></main>'
    focusHeadingWhenReady()
    const link = document.querySelector('a')
    link?.focus()
    document.getElementById('main')?.append(document.createElement('h1'))
    await Promise.resolve()
    expect(document.activeElement).toBe(link)
  })

  it('stops waiting when cancelled', async () => {
    document.body.innerHTML = '<main id="main"></main>'
    const stop = focusHeadingWhenReady()
    stop()
    document.getElementById('main')?.append(document.createElement('h1'))
    await Promise.resolve()
    expect(document.activeElement).toBe(document.body)
  })
})
