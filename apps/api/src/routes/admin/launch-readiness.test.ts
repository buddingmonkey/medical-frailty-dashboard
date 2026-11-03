import { launchReadinessResponseSchema } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// GET /api/admin/launch-readiness (roadmap M8 step 1). The counts are tested in
// src/db/launch-readiness.test.ts; this checks access and the response shape.

const path = '/api/admin/launch-readiness'

beforeEach(async () => {
  await seedOverview()
})

describe('GET /api/admin/launch-readiness', () => {
  it('refuses a request without a signed Access token', async () => {
    expect((await call(path)).status).toBe(401)
  })

  it('is refused to a signed-in non-admin', async () => {
    const res = await call(path, { token: await accessToken({ email: 'guest@example.org' }) })
    expect(res.status).toBe(403)
  })

  it('returns each published state and the gate', async () => {
    const res = await call(path, { token: await accessToken() })
    expect(res.status).toBe(200)
    const body = launchReadinessResponseSchema.parse(await res.json())
    expect(body.states.map((s) => [s.stateId, s.ready])).toEqual([
      ['GA', false],
      ['MT', true],
    ])
    expect(body).toMatchObject({ readyCount: 1, required: 2, gatePassed: false })
  })
})
