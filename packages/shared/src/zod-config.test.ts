import { globalConfig } from 'zod/v4/core'
import { expect, it } from 'vitest'

import './index'

it('importing the package turns on Zod jitless, so Zod never tries new Function under our CSP', () => {
  expect(globalConfig.jitless).toBe(true)
})
