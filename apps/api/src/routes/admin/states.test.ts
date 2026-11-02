import { stateListResponseSchema } from '@mfcd/shared'
import { describe, expect, it } from 'vitest'

import { accessToken, call } from '../../test/access-fixtures'

// No resetDb here: this reads the rows migration 0003_seed_states put in a fresh database.
describe('GET /api/admin/states', () => {
  it('lists every state and DC from the seed migration, by name', async () => {
    const res = await call('/api/admin/states', { token: await accessToken() })
    const { items } = stateListResponseSchema.parse(await res.json())

    expect(items).toHaveLength(51)
    expect(items[0]).toEqual({ id: 'AL', name: 'Alabama', status: 'none' })
    expect(items.find((s) => s.id === 'DC')?.name).toBe('District of Columbia')
    expect(items.map((s) => s.name)).toEqual([...items.map((s) => s.name)].sort())
  })
})
