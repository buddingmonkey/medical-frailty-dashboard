import { nextTick } from 'vue'
import type { Router } from 'vue-router'

// Focus after a route change (roadmap M8 step 2; WCAG 2.4.3). A single-page app keeps focus on
// the link that was followed, so a keyboard or screen reader user would not learn that the page
// changed. After each navigation to another path, focus moves to the new page's <h1> (made
// focusable with tabindex="-1"), so its name is read and the next Tab goes on from there.
// Pages that load their data render the heading later: wait for it, up to WAIT_MS.
// Left alone: the first load, a change of query only (filters, search typing), a #hash link
// (the browser scrolls to it), and a user who has already moved focus into the new page.

const WAIT_MS = 5000

export function installRouteFocus(router: Router): void {
  let cancel: (() => void) | undefined

  router.afterEach((to, from, failure) => {
    if (failure !== undefined || from.matched.length === 0) return
    if (to.path === from.path || to.hash !== '') return
    cancel?.()
    void nextTick(() => {
      cancel = focusHeadingWhenReady()
    })
  })
}

/** Focuses the main heading now or as soon as it appears. Returns a function that stops waiting. */
export function focusHeadingWhenReady(root: Document = document): () => void {
  const main = root.getElementById('main')
  if (!main) return () => undefined

  const tryFocus = (): boolean => {
    const heading = main.querySelector('h1')
    if (!heading) return false
    const active = root.activeElement
    // The user already moved on inside the new page: do not take focus back.
    if (active && active !== main && main.contains(active)) return true
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus()
    return true
  }
  if (tryFocus()) return () => undefined

  const observer = new MutationObserver(() => {
    if (tryFocus()) stop()
  })
  const timer = setTimeout(() => {
    stop()
  }, WAIT_MS)
  function stop() {
    observer.disconnect()
    clearTimeout(timer)
  }
  observer.observe(main, { childList: true, subtree: true })
  return stop
}
