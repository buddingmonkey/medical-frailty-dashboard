import { whoamiResponseSchema } from '@mfcd/shared'
import { describe, expect, it } from 'vitest'

import { accessToken, call } from '../../test/access-fixtures'

describe('GET /api/admin/whoami', () => {
  it('returns the signed-in admin and is never cached', async () => {
    const res = await call('/api/admin/whoami', { token: await accessToken() })

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(whoamiResponseSchema.parse(await res.json()).email).toBe('admin@example.org')
  })
})
