import { cleanup } from '@testing-library/vue'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './msw-server'

// Any request without an MSW handler fails the test, so no test reaches a real network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterAll(() => {
  server.close()
})
